const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { Files, MAX_TEXT } = require('../electron/files.cjs')
const { Readable, Writable } = require('node:stream')
const { SFTP } = require('@electerm/ssh2/lib/protocol/SFTP.js')

test('external-open classification preserves text and distinguishes binary from I/O failures', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-file-kinds-'))
  const files = new Files(null)
  const put = (name, content) => {
    const p = path.join(directory, name)
    fs.writeFileSync(p, content)
    return p
  }
  try {
    const text = '\ufeff中文 🌏\r\ntext\r\n'
    assert.equal((await files.readText('local', put('text.data', text))).text, text)
    assert.equal((await files.readText('local', put('empty', ''))).text, '')
    await assert.rejects(files.readText('local', put('small.bin', Buffer.from([0, 255, 10]))), {
      code: 'FILE_BINARY'
    })
    await assert.rejects(files.readText('local', put('ascii.pdf', '%PDF-1.4\n%%EOF')), {
      code: 'FILE_BINARY'
    })
    await assert.rejects(files.readText('local', put('legacy.txt', Buffer.from([0xff, 0xfe, 0x41]))), {
      code: 'FILE_ENCODING'
    })
    await assert.rejects(files.readText('local', put('large.bin', Buffer.alloc(MAX_TEXT + 1))), {
      code: 'FILE_BINARY'
    })
    // A sample may end in the middle of a multibyte character. It is still text.
    await assert.rejects(files.readText('local', put('large.txt', '中'.repeat(MAX_TEXT))), /大于 2 MiB/)
    await assert.rejects(files.readText('local', path.join(directory, 'missing')), { code: 'ENOENT' })
    await assert.rejects(files.readText('local', directory), /普通文件/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('local program opening uses the existing local file and reports association failures', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-local-open-'))
  const files = new Files(null)
  const p = path.join(directory, '中文 space.png')
  fs.writeFileSync(p, Buffer.from([0, 255, 4]))
  let calls = 0
  const open = async (file) => {
    calls++
    assert.equal(file, fs.realpathSync.native(p))
    assert.deepEqual(fs.readFileSync(file), Buffer.from([0, 255, 4]))
    return ''
  }
  try {
    assert.deepEqual(await files.openLocal('local', p, open), {
      path: fs.realpathSync.native(p),
      temporary: false
    })
    await assert.rejects(files.openLocal('local', directory, open), /普通文件/)
    await assert.rejects(
      files.openLocal('local', p, async () => 'no default application'),
      /默认程序/
    )
    assert.equal(calls, 1)
    assert.deepEqual(fs.readdirSync(directory), ['中文 space.png'])
    assert.equal(files.openings.size, 0)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('remote external opens isolate same-name snapshots and clean failed or canceled downloads', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-open-snapshots-'))
  const files = new Files(null)
  const bytes = Buffer.from([0, 255, 17, 32])
  let makeRead = () => Readable.from(bytes)
  files.adapter = async () => ({
    path: path.posix,
    realpath: async (p) => p,
    stat: async () => ({ isFile: () => true }),
    read: () => makeRead()
  })
  let calls = 0
  const open = async (p) => {
    calls++
    assert.deepEqual(fs.readFileSync(p), bytes)
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(p).mode & 0o777, 0o600)
      assert.equal(fs.statSync(path.dirname(p)).mode & 0o777, 0o700)
    }
    return ''
  }
  try {
    const first = await files.openLocal('remote-A', '/one/中文 space.png', open, directory)
    fs.writeFileSync(first.path, 'external edit')
    const second = await files.openLocal('remote-B', '/two/中文 space.png', open, directory)
    assert.notEqual(first.path, second.path)
    assert.equal(path.basename(second.path), '中文 space.png')
    assert.equal(first.temporary, true)
    assert.equal(fs.readFileSync(first.path, 'utf8'), 'external edit')
    const reserved = await files.openLocal('remote-A', '/CON.pdf', open, directory)
    assert.equal(path.basename(reserved.path), '_CON.pdf')
    const unsafe = await files.openLocal('remote-A', '/folder/a\\b:stream.png', open, directory)
    assert.equal(path.basename(unsafe.path), 'a_b_stream.png')
    assert.equal(calls, 4)
    const complete = fs.readdirSync(directory).sort()
    let failedPath
    await assert.rejects(
      files.openLocal(
        'remote-A',
        '/failed.bin',
        async (p) => {
          failedPath = p
          return 'no default application'
        },
        directory
      ),
      /默认程序/
    )
    assert.equal(fs.existsSync(path.dirname(failedPath)), false)
    makeRead = () =>
      new Readable({
        read() {
          this.push(bytes)
          this.destroy(new Error('download interrupted'))
        }
      })
    await assert.rejects(files.openLocal('remote-A', '/broken.bin', open, directory), /download interrupted/)
    let started
    const reading = new Promise((resolve) => (started = resolve))
    makeRead = () =>
      new Readable({
        read() {
          started()
        }
      })
    const pending = files.openLocal('remote-A', '/cancel.bin', open, directory)
    const canceled = assert.rejects(pending, { name: 'AbortError' })
    await reading
    files.cancelAll()
    await canceled
    assert.equal(calls, 4)
    assert.deepEqual(fs.readdirSync(directory).sort(), complete)
    assert.equal(files.openings.size, 0)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test(
  'ssh2 write streams terminate when EOF arrives before their handle closes',
  { timeout: 1500 },
  async () => {
    let closedRequests = 0
    const ftp = {
      readable: true,
      incoming: { state: 'open' },
      lstat: (_path, callback) => callback(Object.assign(new Error('Missing'), { code: 2 })),
      createWriteStream: SFTP.prototype.createWriteStream,
      open: (_path, _flags, _mode, callback) => queueMicrotask(() => callback(null, Buffer.from('handle'))),
      fchmod: (_handle, _mode, callback) => callback(),
      write: (_handle, _buffer, _offset, _length, _position, callback) => {
        // ssh2 sets the incoming state before rejecting pending operations,
        // and only clears readable after their callbacks have run.
        ftp.incoming.state = 'closed'
        callback(new Error('Test connection interrupted'))
        ftp.readable = false
      },
      close: () => {
        closedRequests++
      },
      unlink: () => {
        closedRequests++
      }
    }
    const files = new Files({ sftp: async () => ftp })
    const adapter = await files.adapter('test-remote')
    await assert.rejects(
      files.atomic(adapter, '/target.txt', () => Readable.from('replacement')),
      /Test connection interrupted|SFTP 连接已关闭/
    )
    assert.equal(closedRequests, 0)
  }
)

test('a disconnected SFTP cleanup cannot keep a failed atomic write pending', { timeout: 1500 }, async () => {
  let cleanupRequests = 0
  const ftp = {
    readable: true,
    lstat: (_path, callback) => callback(Object.assign(new Error('Missing'), { code: 2 })),
    createWriteStream: () =>
      new Writable({
        write(_chunk, _encoding, callback) {
          ftp.readable = false
          callback(new Error('Test connection interrupted'))
        }
      }),
    // Match ssh2's behavior when a request is issued after the channel has ended.
    unlink: () => {
      cleanupRequests++
    }
  }
  const files = new Files({ sftp: async () => ftp })
  const adapter = await files.adapter('test-remote')
  await assert.rejects(
    files.atomic(adapter, '/target.txt', () => Readable.from('replacement')),
    /Test connection interrupted/
  )
  assert.equal(cleanupRequests, 0)
  await assert.rejects(adapter.stat('/target.txt'), /SFTP 连接已关闭/)
})

test(
  'Windows drive discovery tolerates unavailable volumes but preserves file operation errors',
  { skip: process.platform !== 'win32' },
  async (t) => {
    // Windows runners may expose TEMP through a short-name or directory alias.
    // The failure injection must match the canonical paths used by Files.list.
    const directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-unavailable-drives-'))
    )
    const files = new Files(null)
    const root = path.parse(fs.realpathSync.native(directory)).root
    const originalLstat = fs.promises.lstat.bind(fs.promises)
    const originalReaddir = fs.promises.readdir.bind(fs.promises)
    const denied = path.join(directory, 'denied')
    const codes = ['UNKNOWN', 'EACCES', 'EIO', 'ENOENT']
    t.mock.method(fs.promises, 'lstat', async (p, ...args) => {
      if (/^[A-Z]:\\$/i.test(p) && p.toUpperCase() !== root.toUpperCase()) {
        const code = codes[p.charCodeAt(0) % codes.length]
        throw Object.assign(new Error('Unavailable test volume'), { code })
      }
      return originalLstat(p, ...args)
    })
    t.mock.method(fs.promises, 'readdir', async (p, ...args) => {
      if (p === denied) throw Object.assign(new Error('Access denied'), { code: 'EACCES' })
      return originalReaddir(p, ...args)
    })
    try {
      fs.writeFileSync(path.join(directory, 'readable.txt'), 'still readable')
      fs.mkdirSync(denied)
      const list = await files.list('local', directory)
      assert.deepEqual(list.roots, [root])
      assert.ok(list.entries.some((entry) => entry.name === 'readable.txt'))
      await assert.rejects(files.list('local', denied), { code: 'EACCES' })
      await assert.rejects(
        files.exists(
          {
            lstat: async () => {
              throw Object.assign(new Error('I/O failure'), { code: 'EIO' })
            }
          },
          'target.txt'
        ),
        { code: 'EIO' }
      )
    } finally {
      t.mock.restoreAll()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)

test('rejected or canceled writes do not open the source stream', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-deferred-read-'))
  const files = new Files(null)
  try {
    const target = path.join(directory, 'existing.txt')
    fs.writeFileSync(target, 'original')
    const adapter = await files.adapter('local')
    let opened = 0
    const source = () => {
      opened++
      return Readable.from('replacement')
    }
    await assert.rejects(files.atomic(adapter, target, source), /已存在/)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      files.atomic(adapter, path.join(directory, 'cancel.txt'), source, { signal: controller.signal }),
      { name: 'AbortError' }
    )
    assert.equal(opened, 0)
    assert.equal(fs.readFileSync(target, 'utf8'), 'original')
    assert.deepEqual(fs.readdirSync(directory), ['existing.txt'])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
test('native paths, Unicode files, optimistic edits, local transfers and permission preservation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-native-files-'))
  const files = new Files(null)
  try {
    const p = path.join(directory, '中文 space.txt')
    fs.writeFileSync(p, 'line1\r\nline2\r\n')
    if (process.platform !== 'win32') fs.chmodSync(p, 0o640)
    const list = await files.list('local', directory)
    assert.equal(list.separator, path.sep)
    assert.equal(list.path, fs.realpathSync.native(directory))
    assert.ok(list.entries.some((e) => e.path === fs.realpathSync.native(p)))
    assert.ok(list.roots.length >= 1)
    const first = await files.readText('local', p)
    await files.writeText('local', p, first.text + 'next\r\n', first.hash)
    if (process.platform !== 'win32') assert.equal(fs.statSync(p).mode & 0o777, 0o640)
    await assert.rejects(files.writeText('local', p, 'stale', first.hash), /修改/)
    const target = path.join(directory, 'target')
    fs.mkdirSync(target)
    files.transfer({ source: 'local', destination: 'local', paths: [p], directory: target })
    await files.queue
    assert.equal(fs.readFileSync(path.join(target, path.basename(p)), 'utf8'), 'line1\r\nline2\r\nnext\r\n')
    await files.operate({
      endpoint: 'local',
      action: 'rename',
      path: path.join(target, path.basename(p)),
      name: 'renamed.txt'
    })
    assert.ok(fs.existsSync(path.join(target, 'renamed.txt')))
    await files.operate({ endpoint: 'local', action: 'delete', path: target })
    assert.equal(fs.existsSync(target), false)
  } finally {
    await files.queue
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
test('directory aliases return canonical paths that still identify the requested Unicode file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-path-alias-'))
  const files = new Files(null)
  try {
    const real = path.join(directory, 'real folder')
    const alias = path.join(directory, 'alias folder')
    fs.mkdirSync(real)
    fs.writeFileSync(path.join(real, '中文.txt'), 'canonical path content')
    fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const list = await files.list('local', alias)
    assert.equal(list.path, fs.realpathSync.native(alias))
    const entry = list.entries.find((item) => item.name === '中文.txt')
    assert.ok(entry)
    assert.equal(entry.path, fs.realpathSync.native(path.join(alias, '中文.txt')))
    assert.equal((await files.readText('local', entry.path)).text, 'canonical path content')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
