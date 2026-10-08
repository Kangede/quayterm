const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { Store } = require('../electron/store.cjs')
const { KnownHosts, matches, fingerprint } = require('../electron/known-hosts.cjs')
const { Sessions } = require('../electron/sessions.cjs')
const { Files } = require('../electron/files.cjs')
const { validateHost } = require('../electron/validation.cjs')
const { fixture } = require('./fixture.cjs')
let fx, store, known, sessions, files, dir, host, id
function status(sessionId, desired) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sessions.off('event', event)
      reject(new Error('SSH timeout'))
    }, 10000)
    const event = (e) => {
      if (e.id !== sessionId || e.type !== 'session-status') return
      if (e.state === desired || e.state === 'error') {
        clearTimeout(timer)
        sessions.off('event', event)
        e.state === desired ? resolve(e) : reject(new Error(e.message))
      }
    }
    sessions.on('event', event)
  })
}
before(async () => {
  fx = await fixture()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-store-'))
  store = new Store(dir)
  known = new KnownHosts(store)
  sessions = new Sessions(store, known)
  files = new Files(sessions)
  sessions.on('event', (e) => {
    if (e.type === 'host-verification') sessions.respond(e.challengeId, true)
    if (e.type === 'terminal-data') sessions.ack(e.id, e.bytes)
  })
  host = store.upsert(fx.host)
  id = crypto.randomUUID()
  const ready = status(id, 'ready')
  sessions.start({ id, hostId: host.id })
  await ready
})
after(async () => {
  files?.cancelAll()
  await files?.queue
  sessions?.closeAll()
  await fx?.close()
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})
test('host validation rejects invalid ports and excludes arbitrary SSH options', () => {
  assert.throws(() => validateHost({ address: 'localhost', username: 'x', port: 65536 }))
  assert.throws(() => validateHost({ address: 'bad\nhost', username: 'x' }))
  const h = validateHost({ address: '::1', username: 'x', privateKey: 'BAD', agent: 'BAD', tags: ['a', 'a'] })
  assert.equal(h.agent, undefined)
  assert.equal(h.privateKey, undefined)
  assert.deepEqual(h.tags, ['a'])
})
test('password stays out of disk and renderer without OS secure storage', () => {
  const disk = fs.readFileSync(store.file, 'utf8')
  assert.ok(!disk.includes('fixture-password'))
  assert.equal(store.password(host.id), 'fixture-password')
  assert.equal(host.password, undefined)
  assert.equal(host.secret, undefined)
  assert.equal(host.hasPassword, true)
})
test('encrypted credentials survive reload and never appear in public host objects', () => {
  const vault = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'test',
    encryptString: (s) => Buffer.from(s.split('').reverse().join('')),
    decryptString: (b) => b.toString().split('').reverse().join('')
  }
  const encrypted = new Store(path.join(dir, 'encrypted'), vault)
  const h = encrypted.upsert({ ...fx.host, rememberPassword: true })
  const reloaded = new Store(path.join(dir, 'encrypted'), vault)
  assert.equal(reloaded.password(h.id), fx.host.password)
  assert.ok(!fs.readFileSync(encrypted.file, 'utf8').includes(fx.host.password))
  assert.equal(reloaded.list()[0].secret, undefined)
})
test('known host changed fingerprints are rejected; hashed OpenSSH host labels match', () => {
  const entry = known.list()[0]
  const key = Buffer.from(entry.publicKey, 'base64')
  assert.equal(known.check(host.address, host.port, key).state, 'trusted')
  const changed = Buffer.from(key)
  changed[changed.length - 1] ^= 1
  assert.equal(known.check(host.address, host.port, changed).state, 'changed')
  assert.throws(() => known.trust(host.address, host.port, changed))
  const salt = crypto.randomBytes(20)
  const label = entry.label
  const hashed =
    '|1|' + salt.toString('base64') + '|' + crypto.createHmac('sha1', salt).update(label).digest('base64')
  assert.equal(matches(hashed, label), true)
  assert.equal(matches(hashed, 'other'), false)
  const result = known.import(
    `# comment\n${label} ${entry.algorithm} ${entry.publicKey}\n*.example.test ${entry.algorithm} ${entry.publicKey}\ninvalid-line`
  )
  assert.equal(result.added, 0)
  assert.equal(result.skipped, 2)
})
test('SSH sessions use independent PTYs and apply real window-change requests', async () => {
  const second = crypto.randomUUID()
  const ready = status(second, 'ready')
  sessions.start({ id: second, hostId: host.id })
  await ready
  assert.notEqual(sessions.get(id).channel, sessions.get(second).channel)
  assert.equal(new Set(fx.shells).size, 2)
  sessions.resize(second, 123, 42)
  await new Promise((r) => setTimeout(r, 100))
  assert.ok(fx.sizes.some((s) => s.cols === 123 && s.rows === 42))
  sessions.close(second)
})
test('SFTP lists real files, Unicode names, hidden files and symlinks without shell commands', async () => {
  const count = fx.inputs.length
  fs.symlinkSync('documents', path.join(fx.root, 'linked-folder'))
  const list = await files.list(id)
  assert.equal(list.path, fx.root)
  assert.ok(list.entries.find((f) => f.name === 'hello.txt'))
  assert.ok(list.entries.find((f) => f.name === '.hidden'))
  assert.ok(list.entries.find((f) => f.name === 'linked-folder' && f.isDirectory && f.isSymlink))
  assert.equal(fx.inputs.length, count)
})
test('text editor round trips Unicode and rejects stale saves and binary content', async () => {
  const p = path.join(fx.root, 'hello.txt')
  const first = await files.readText(id, p)
  assert.ok(first.text.includes('你好'))
  await files.writeText(id, p, first.text + 'saved ✓\n', first.hash)
  const next = await files.readText(id, p)
  assert.ok(next.text.endsWith('saved ✓\n'))
  await assert.rejects(files.writeText(id, p, 'stale', first.hash), /修改/)
  assert.equal(fs.readFileSync(p, 'utf8'), next.text)
  fs.writeFileSync(path.join(fx.root, 'binary'), Buffer.from([0, 255, 0]))
  await assert.rejects(files.readText(id, path.join(fx.root, 'binary')), /二进制/)
  fs.writeFileSync(path.join(fx.root, 'bom.txt'), '\ufeffhello\r\n')
  const bom = await files.readText(id, path.join(fx.root, 'bom.txt'))
  assert.ok(bom.text.startsWith('\ufeff'))
  assert.ok(bom.text.endsWith('\r\n'))
})
test('file creation, rename and deletion operate safely on SFTP including recursive folders', async () => {
  await files.operate({ endpoint: id, action: 'mkdir', path: fx.root, name: '临时 测试' })
  const dir = path.join(fx.root, '临时 测试')
  await files.operate({ endpoint: id, action: 'create', path: dir, name: '空文件.txt' })
  await files.operate({
    endpoint: id,
    action: 'rename',
    path: path.join(dir, '空文件.txt'),
    name: 'renamed.txt'
  })
  assert.ok(fs.existsSync(path.join(dir, 'renamed.txt')))
  await assert.rejects(files.operate({ endpoint: id, action: 'create', path: dir, name: '../bad' }), /文件名/)
  await assert.rejects(files.operate({ endpoint: id, action: 'delete', path: '/' }), /根目录/)
  await files.operate({ endpoint: id, action: 'delete', path: dir })
  assert.equal(fs.existsSync(dir), false)
})
test('local to SFTP and SFTP to local recursive transfers preserve content', async () => {
  const source = path.join(dir, 'upload')
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'payload.bin'), crypto.randomBytes(500000))
  fs.mkdirSync(path.join(source, 'child'))
  fs.writeFileSync(path.join(source, 'child', '你好.txt'), 'nested')
  const a = files.transfer({ source: 'local', destination: id, paths: [source], directory: fx.root })
  let last
  const listener = (e) => {
    if (e.id === a.id) last = e
  }
  files.on('event', listener)
  await files.queue
  files.off('event', listener)
  assert.equal(last.state, 'done', last.message)
  assert.deepEqual(
    fs.readFileSync(path.join(source, 'payload.bin')),
    fs.readFileSync(path.join(fx.root, 'upload', 'payload.bin'))
  )
  const download = path.join(dir, 'download')
  fs.mkdirSync(download)
  files.transfer({
    source: id,
    destination: 'local',
    paths: [path.join(fx.root, 'upload')],
    directory: download
  })
  await files.queue
  assert.equal(fs.readFileSync(path.join(download, 'upload', 'child', '你好.txt'), 'utf8'), 'nested')
  assert.equal(fs.readdirSync(fx.root).filter((n) => n.endsWith('.part')).length, 0)
})
test('transfer collision never silently overwrites; canceled queued transfers write nothing', async () => {
  const source = path.join(dir, 'collision.txt')
  fs.writeFileSync(source, 'new')
  fs.writeFileSync(path.join(fx.root, 'collision.txt'), 'old')
  files.transfer({ source: 'local', destination: id, paths: [source], directory: fx.root })
  await files.queue
  assert.equal(fs.readFileSync(path.join(fx.root, 'collision.txt'), 'utf8'), 'old')
  files.transfer({ source: 'local', destination: id, paths: [source], directory: fx.root, overwrite: true })
  await files.queue
  assert.equal(fs.readFileSync(path.join(fx.root, 'collision.txt'), 'utf8'), 'new')
  const p = path.join(dir, 'cancel.txt')
  fs.writeFileSync(p, 'cancel')
  const canceled = files.transfer({ source: 'local', destination: id, paths: [p], directory: fx.root })
  files.cancel(canceled.id)
  await files.queue
  assert.equal(fs.existsSync(path.join(fx.root, 'cancel.txt')), false)
})
test('authentication failure becomes a visible error without retaining a live connection', async () => {
  const bad = crypto.randomUUID()
  const failed = new Promise((resolve) => {
    const handler = (e) => {
      if (e.id === bad && e.state === 'error') {
        sessions.off('event', handler)
        resolve(e)
      }
    }
    sessions.on('event', handler)
  })
  sessions.start({ id: bad, hostId: host.id, password: 'wrong' })
  const error = await failed
  assert.match(error.message, /authentication/i)
  sessions.close(bad)
})
