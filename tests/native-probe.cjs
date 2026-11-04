// A portable protocol peer for native Windows/macOS/Linux desktop checks.
// It speaks real SSH/SFTP on loopback, executes no commands, and exposes
// read-only in-memory files. Real PTY and multiplexer tests use fixture.cjs.
const { Server, utils } = require('@electerm/ssh2')
const crypto = require('node:crypto')
const path = require('node:path').posix
const { fingerprint } = require('../electron/known-hosts.cjs')

async function nativeProbe({ extraFiles = {} } = {}) {
  const key = crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
  const text = 'Native SFTP ✓\n跨平台文件浏览\n'
  const contents = Buffer.from(text)
  const files = new Map([['/native/info.txt', contents]])
  const directories = new Set(['/native'])
  for (const [name, value] of Object.entries(extraFiles)) {
    if (!name.startsWith('/native/') || path.normalize(name) !== name) throw new Error('Invalid fixture path')
    files.set(name, Buffer.from(value))
    for (let p = path.dirname(name); p.startsWith('/native/'); p = path.dirname(p)) directories.add(p)
  }
  const clients = new Set()
  const channels = new Set()
  const input = []
  const dimensions = []
  const attrs = {
    mode: 0o100600,
    size: contents.length,
    uid: 1000,
    gid: 1000,
    atime: 1700000000,
    mtime: 1700000000
  }
  const directoryAttrs = { ...attrs, mode: 0o40700, size: 0 }
  const server = new Server({ hostKeys: [key] }, (client) => {
    clients.add(client)
    client.on('error', () => {})
    client.on('close', () => clients.delete(client))
    client.on('authentication', (context) => {
      if (
        context.method === 'password' &&
        context.username === 'tester' &&
        context.password === 'native-fixture-not-a-secret'
      )
        context.accept()
      else context.reject(['password'])
    })
    client.on('ready', () =>
      client.on('session', (accept) => {
        const session = accept()
        session.on('env', (accept) => accept?.())
        session.on('pty', (accept, _reject, info) => {
          dimensions.push({ cols: info.cols, rows: info.rows })
          accept()
        })
        session.on('window-change', (accept, _reject, info) => {
          dimensions.push({ cols: info.cols, rows: info.rows })
          accept?.()
        })
        session.on('shell', (accept) => {
          const stream = accept()
          channels.add(stream)
          stream.on('close', () => channels.delete(stream))
          stream.write('\x1b[?2004h\x1b[32mNative SSH ready 测试\x1b[0m\r\n> ')
          stream.on('data', (bytes) => {
            input.push(Buffer.from(bytes))
            stream.write(bytes)
          })
        })
        session.on('sftp', (accept) => {
          const sftp = accept()
          const handles = new Map()
          let next = 0
          const fail = (id) => sftp.status(id, 2)
          const canonical = (p) => (['.', '/'].includes(p) ? '/native' : path.normalize(p))
          const info = (p) =>
            files.has(canonical(p))
              ? { ...attrs, size: files.get(canonical(p)).length }
              : directories.has(canonical(p))
                ? directoryAttrs
                : null
          const handle = (id, kind, p) => {
            const key = String(++next)
            handles.set(key, { kind, path: canonical(p), listed: false })
            sftp.handle(id, Buffer.from(key))
          }
          sftp.on('error', () => {})
          sftp.on('REALPATH', (id, p) =>
            info(p) ? sftp.name(id, [{ filename: canonical(p), longname: '', attrs: info(p) }]) : fail(id)
          )
          for (const event of ['STAT', 'LSTAT'])
            sftp.on(event, (id, p) => (info(p) ? sftp.attrs(id, info(p)) : fail(id)))
          sftp.on('FSTAT', (id, key) => {
            const item = handles.get(key.toString())
            return item ? sftp.attrs(id, info(item.path)) : fail(id)
          })
          sftp.on('OPENDIR', (id, p) =>
            info(p)?.mode === directoryAttrs.mode ? handle(id, 'directory', p) : fail(id)
          )
          sftp.on('READDIR', (id, key) => {
            const item = handles.get(key.toString())
            if (!item || item.kind !== 'directory') return fail(id)
            if (item.listed) return sftp.status(id, 1)
            item.listed = true
            sftp.name(
              id,
              [...directories, ...files.keys()]
                .filter((p) => p !== item.path && path.dirname(p) === item.path)
                .map((p) => ({ filename: path.basename(p), longname: '', attrs: info(p) }))
            )
          })
          sftp.on('OPEN', (id, p, flags) =>
            files.has(canonical(p)) && flags === 1 ? handle(id, 'file', p) : sftp.status(id, 3)
          )
          sftp.on('READ', (id, key, offset, length) => {
            const item = handles.get(key.toString())
            if (item?.kind !== 'file') return fail(id)
            const data = files.get(item.path)
            if (offset >= data.length) return sftp.status(id, 1)
            sftp.data(id, data.subarray(offset, offset + length))
          })
          sftp.on('CLOSE', (id, key) => {
            handles.delete(key.toString())
            sftp.status(id, 0)
          })
        })
      })
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    fingerprint: fingerprint(utils.parseKey(key).getPublicSSH()),
    text,
    input,
    dimensions,
    output(data) {
      for (const channel of channels) channel.write(data)
    },
    async close() {
      for (const client of clients) client.end()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}
module.exports = { nativeProbe }
