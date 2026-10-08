const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { pipeline } = require('node:stream/promises')
const { Transform, Readable } = require('node:stream')
const { EventEmitter } = require('node:events')
const { safePath, filename } = require('./validation.cjs')
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
const MAX_TEXT = 2 * 1024 * 1024
const isMissing = (error) => error?.code === 'ENOENT' || error?.code === 2
function call(ftp, method, ...args) {
  return new Promise((resolve, reject) =>
    ftp[method](...args, (err, result) => (err ? reject(err) : resolve(result)))
  )
}
class Files extends EventEmitter {
  constructor(sessions) {
    super()
    this.sessions = sessions
    this.transfers = new Map()
    this.queue = Promise.resolve()
    this.locks = new Map()
  }
  async adapter(endpoint) {
    if (endpoint === 'local')
      return {
        path,
        home: os.homedir(),
        realpath: (p) => fsp.realpath(p),
        stat: (p) => fsp.stat(p),
        lstat: (p) => fsp.lstat(p),
        readdir: async (p) =>
          Promise.all(
            (await fsp.readdir(p, { withFileTypes: true })).map(async (d) => {
              const full = path.join(p, d.name)
              try {
                const attrs = await fsp.lstat(full)
                return { name: d.name, attrs }
              } catch {
                return { name: d.name, attrs: null }
              }
            })
          ),
        read: (p) => fs.createReadStream(p),
        write: (p, mode) => fs.createWriteStream(p, { flags: 'wx', mode: mode || 0o600 }),
        mkdir: (p) => fsp.mkdir(p),
        unlink: (p) => fsp.unlink(p),
        rmdir: (p) => fsp.rmdir(p),
        rename: (a, b) => fsp.rename(a, b),
        replace: (a, b) => fsp.rename(a, b),
        chmod: (p, mode) => (process.platform === 'win32' ? Promise.resolve() : fsp.chmod(p, mode)),
        chown: (p, uid, gid) => (process.platform === 'win32' ? Promise.resolve() : fsp.chown(p, uid, gid))
      }
    const ftp = await this.sessions.sftp(endpoint)
    return {
      path: path.posix,
      home: '.',
      realpath: (p) => call(ftp, 'realpath', p),
      stat: (p) => call(ftp, 'stat', p),
      lstat: (p) => call(ftp, 'lstat', p),
      readdir: async (p) =>
        (await call(ftp, 'readdir', p)).map((e) => ({ name: e.filename, attrs: e.attrs })),
      read: (p) => ftp.createReadStream(p),
      write: (p, mode) => ftp.createWriteStream(p, { flags: 'wx', mode: mode || 0o600 }),
      mkdir: (p) => call(ftp, 'mkdir', p),
      unlink: (p) => call(ftp, 'unlink', p),
      rmdir: (p) => call(ftp, 'rmdir', p),
      rename: (a, b) => call(ftp, 'rename', a, b),
      replace: (a, b) => call(ftp, 'ext_openssh_rename', a, b),
      chmod: (p, mode) => call(ftp, 'chmod', p, mode),
      chown: (p, uid, gid) => call(ftp, 'chown', p, uid, gid)
    }
  }
  async exists(a, p) {
    try {
      return await a.lstat(p)
    } catch (e) {
      if (isMissing(e)) return null
      throw e
    }
  }
  async list(endpoint, requested) {
    const a = await this.adapter(endpoint)
    const dir = await a.realpath(requested ? safePath(requested) : a.home)
    const entries = await a.readdir(dir)
    const result = []
    // Resolve symlink types in bounded batches without invoking a remote shell.
    for (let i = 0; i < entries.length; i += 20)
      result.push(
        ...(await Promise.all(
          entries
            .slice(i, i + 20)
            .filter((e) => e.name !== '.' && e.name !== '..')
            .map(async (e) => {
              const full = a.path.join(dir, e.name)
              const stat = e.attrs
              let isDirectory = Boolean(stat?.isDirectory())
              if (stat?.isSymbolicLink()) {
                try {
                  isDirectory = (await a.stat(full)).isDirectory()
                } catch {}
              }
              return {
                name: e.name,
                path: full,
                isDirectory,
                isSymlink: Boolean(stat?.isSymbolicLink()),
                size: stat?.size || 0,
                modified: stat?.mtimeMs ?? (stat?.mtime || 0) * 1000,
                mode: stat?.mode || 0,
                inaccessible: !stat
              }
            })
        ))
      )
    result.sort(
      (x, y) =>
        Number(y.isDirectory) - Number(x.isDirectory) ||
        x.name.localeCompare(y.name, 'zh-CN', { numeric: true })
    )
    let roots = [a.path.parse(dir).root]
    if (endpoint === 'local' && process.platform === 'win32')
      roots = (
        await Promise.all(
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (c) => {
            const p = `${c}:\\`
            return (await this.exists(a, p)) ? p : null
          })
        )
      ).filter(Boolean)
    return { path: dir, parent: a.path.dirname(dir), separator: a.path.sep, entries: result, roots }
  }
  async buffer(a, p, max = MAX_TEXT) {
    const stat = await a.stat(p)
    if (!stat.isFile()) throw new Error('只能打开普通文件')
    if (stat.size > max) throw new Error('文件大于 2 MiB，请下载后使用本地编辑器打开')
    const chunks = []
    let size = 0
    for await (const chunk of a.read(p)) {
      size += chunk.length
      if (size > max) throw new Error('文件过大')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  async readText(endpoint, p) {
    safePath(p)
    const a = await this.adapter(endpoint)
    const buffer = await this.buffer(a, p)
    if (buffer.includes(0)) throw new Error('这是二进制文件，请通过传输功能下载')
    let text
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
    } catch {
      throw new Error('文件不是 UTF-8 文本，请下载后打开')
    }
    return { text, hash: hash(buffer), size: buffer.length }
  }
  async locked(key, operation) {
    const previous = this.locks.get(key) || Promise.resolve()
    const next = previous.catch(() => {}).then(operation)
    this.locks.set(key, next)
    try {
      return await next
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key)
    }
  }
  async atomic(a, destination, source, { overwrite = false, expectedHash, signal, progress, mode } = {}) {
    const original = await this.exists(a, destination)
    if (original?.isSymbolicLink()) throw new Error('为避免覆盖链接目标，请打开文件的真实路径后操作')
    if (original && !original.isFile()) throw new Error('目标不是普通文件')
    if (original && !overwrite) throw new Error('目标文件已存在，请选择允许覆盖后重试')
    if (expectedHash !== undefined) {
      if (!original || hash(await this.buffer(a, destination)) !== expectedHash)
        throw new Error('文件已在其他位置修改，请重新打开后再保存')
    }
    const temp = a.path.join(a.path.dirname(destination), `.quayterm-${crypto.randomUUID()}.part`)
    try {
      const meter = new Transform({
        transform(chunk, _encoding, cb) {
          progress?.(chunk.length)
          cb(null, chunk)
        }
      })
      await pipeline(source, meter, a.write(temp, original ? original.mode & 0o777 : 0o600), { signal })
      if (original && Number.isInteger(original.uid) && Number.isInteger(original.gid)) {
        const tempStat = await a.stat(temp)
        if (tempStat.uid !== original.uid || tempStat.gid !== original.gid)
          await a.chown(temp, original.uid, original.gid)
      }
      if (original || mode !== undefined) await a.chmod(temp, original ? original.mode & 0o777 : mode & 0o777)
      if (expectedHash !== undefined && hash(await this.buffer(a, destination)) !== expectedHash)
        throw new Error('文件保存期间已发生变化，已保留远端版本')
      const current = await this.exists(a, destination)
      if (!overwrite && current) throw new Error('目标文件已存在，已取消覆盖')
      if (current) await a.replace(temp, destination)
      else await a.rename(temp, destination)
    } finally {
      await a.unlink(temp).catch(() => {})
    }
  }
  async writeText(endpoint, p, text, expectedHash) {
    safePath(p)
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_TEXT || typeof expectedHash !== 'string')
      throw new Error('文本或文件版本无效')
    return this.locked(`${endpoint}:${p}`, async () => {
      const a = await this.adapter(endpoint)
      const data = Buffer.from(text)
      await this.atomic(a, p, Readable.from(data), { overwrite: true, expectedHash })
      return { hash: hash(data), size: data.length }
    })
  }
  async operate({ endpoint, action, path: p, name }) {
    safePath(p)
    const a = await this.adapter(endpoint)
    if (['mkdir', 'create', 'rename'].includes(action)) filename(name)
    if (action === 'mkdir') return a.mkdir(a.path.join(p, name))
    if (action === 'create') return this.atomic(a, a.path.join(p, name), Readable.from(Buffer.alloc(0)))
    if (action === 'rename') {
      const destination = a.path.join(a.path.dirname(p), name)
      if (destination === p) return
      if (await this.exists(a, destination)) throw new Error('同名文件已存在')
      return a.rename(p, destination)
    }
    if (action === 'delete') {
      if (a.path.resolve(p) === a.path.parse(a.path.resolve(p)).root) throw new Error('不能删除根目录')
      let count = 0
      const remove = async (entry, depth = 0) => {
        if (++count > 100000 || depth > 100) throw new Error('目录过大，请分批操作')
        const stat = await a.lstat(entry)
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          for (const child of await a.readdir(entry)) {
            if (!['.', '..'].includes(child.name)) await remove(a.path.join(entry, child.name), depth + 1)
          }
          await a.rmdir(entry)
        } else await a.unlink(entry)
      }
      return remove(p)
    }
    throw new Error('不支持的文件操作')
  }
  transfer({ source, destination, paths, directory, overwrite = false }) {
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 5000)
      throw new Error('请选择要传输的文件')
    paths.forEach(safePath)
    safePath(directory)
    const id = crypto.randomUUID()
    const controller = new AbortController()
    const task = {
      id,
      state: 'queued',
      name: paths.length === 1 ? paths[0].split(/[/\\]/).pop() : `${paths.length} 个项目`,
      transferred: 0,
      total: 0,
      source,
      destination,
      message: ''
    }
    const publish = () => this.emit('event', { type: 'transfer', ...task })
    this.transfers.set(id, { controller, task })
    publish()
    const execute = async () => {
      task.state = 'preparing'
      publish()
      const { signal } = controller
      try {
        signal.throwIfAborted()
        const a = await this.adapter(source)
        const b = await this.adapter(destination)
        const targetDirectory = await b.realpath(directory)
        const records = []
        let nodes = 0
        const collect = async (from, to, depth = 0) => {
          signal.throwIfAborted()
          if (++nodes > 100000 || depth > 100) throw new Error('目录过大，请分批传输')
          const stat = await a.lstat(from)
          if (stat.isSymbolicLink()) throw new Error('包含符号链接；请单独选择真实文件，避免意外复制链接目标')
          if (stat.isDirectory()) {
            records.push({ directory: true, from, to })
            for (const child of await a.readdir(from))
              if (!['.', '..'].includes(child.name))
                await collect(a.path.join(from, child.name), b.path.join(to, child.name), depth + 1)
          } else if (stat.isFile()) {
            records.push({ from, to, size: stat.size, mode: stat.mode & 0o777 })
            task.total += stat.size
          } else throw new Error('不支持传输设备或特殊文件')
        }
        for (const p of paths) {
          const from = await a.realpath(p)
          if ((await a.lstat(p)).isSymbolicLink()) throw new Error('请选择真实文件而非符号链接')
          const to = b.path.join(targetDirectory, a.path.basename(from))
          if (source === destination && (from === to || to.startsWith(from + a.path.sep)))
            throw new Error('不能复制到自身或其子目录')
          await collect(from, to)
        }
        for (const record of records) {
          const current = await this.exists(b, record.to)
          if (current && (current.isSymbolicLink() || current.isDirectory() !== Boolean(record.directory)))
            throw new Error('目标路径类型冲突')
          if (current && !record.directory && !overwrite) throw new Error('目标文件已存在，请允许覆盖后重试')
        }
        task.state = 'running'
        publish()
        let last = 0
        for (const record of records) {
          signal.throwIfAborted()
          if (record.directory) {
            if (!(await this.exists(b, record.to))) await b.mkdir(record.to)
            continue
          }
          await this.locked(`${destination}:${record.to}`, () =>
            this.atomic(b, record.to, a.read(record.from), {
              overwrite,
              signal,
              mode: record.mode,
              progress: (bytes) => {
                task.transferred += bytes
                if (Date.now() - last > 100) {
                  publish()
                  last = Date.now()
                }
              }
            })
          )
        }
        task.state = 'done'
      } catch (err) {
        task.state = signal.aborted ? 'canceled' : 'error'
        task.message = signal.aborted ? '传输已取消；已完成的文件保留' : err.message
      }
      publish()
      this.transfers.delete(id)
    }
    this.queue = this.queue.then(execute, execute)
    return { id }
  }
  cancel(id) {
    this.transfers.get(id)?.controller.abort()
  }
  cancelAll() {
    for (const id of this.transfers.keys()) this.cancel(id)
  }
}
module.exports = { Files, MAX_TEXT, hash }
