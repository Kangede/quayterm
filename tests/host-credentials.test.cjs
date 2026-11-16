const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Store } = require('../electron/store.cjs')
const draft = (name, password, rememberPassword = true) => ({
  name,
  address: '127.0.0.1',
  username: 'tester',
  password,
  rememberPassword
})
const vault = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'test-vault',
  encryptString: (text) => Buffer.from('test-encrypted:' + text),
  decryptString: (bytes) => bytes.toString().slice('test-encrypted:'.length)
}
test('credentials are read for one explicit host while public host data stays redacted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-credentials-'))
  try {
    const store = new Store(dir)
    const a = store.upsert(draft('A', 'first-test-only', false))
    const b = store.upsert(draft('B', 'second-test-only', false))
    const empty = store.upsert(draft('Empty', '', false))
    const disk = fs.readFileSync(store.file, 'utf8')
    assert.deepEqual(store.credentials(a.id), { password: 'first-test-only', rememberPassword: false })
    assert.deepEqual(store.credentials(b.id), { password: 'second-test-only', rememberPassword: false })
    assert.deepEqual(store.credentials(empty.id), { password: '', rememberPassword: false })
    assert.equal(fs.readFileSync(store.file, 'utf8'), disk)
    assert.ok(store.list().every((h) => !('password' in h) && !('secret' in h)))
    assert.ok(!disk.includes('first-test-only') && !disk.includes('second-test-only'))
    store.passwords.set('missing', 'orphan-test-only')
    assert.throws(() => store.credentials('missing'), /主机不存在/)
    store.remove(a.id)
    assert.throws(() => store.credentials(a.id), /主机不存在/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
test('saved encrypted credentials can be read after reload without changing the cipher or storage choice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-credentials-'))
  try {
    const store = new Store(dir, vault)
    const host = store.upsert(draft('Saved', 'saved-test-only'))
    const cipher = store.get(host.id).secret
    const reloaded = new Store(dir, vault)
    assert.deepEqual(reloaded.credentials(host.id), { password: 'saved-test-only', rememberPassword: true })
    reloaded.upsert({ ...host, name: 'Renamed', rememberPassword: true })
    assert.equal(reloaded.get(host.id).secret, cipher)
    assert.equal(reloaded.password(host.id), 'saved-test-only')
    reloaded.upsert({ ...host, rememberPassword: false })
    assert.equal(reloaded.get(host.id).secret, undefined)
    assert.deepEqual(reloaded.credentials(host.id), { password: 'saved-test-only', rememberPassword: false })
    reloaded.upsert({ ...host, password: 'replacement-test-only', rememberPassword: true })
    assert.equal(new Store(dir, vault).credentials(host.id).password, 'replacement-test-only')
    reloaded.upsert({ ...host, password: '' })
    assert.equal(reloaded.list()[0].hasPassword, false)
    assert.deepEqual(reloaded.credentials(host.id), { password: '', rememberPassword: false })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
test('credential read failures never erase a saved secret or expose it through normal listing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-credentials-'))
  try {
    const store = new Store(dir, vault)
    const host = store.upsert(draft('Saved', 'unreadable-test-only'))
    const disk = fs.readFileSync(store.file, 'utf8')
    const broken = new Store(dir, {
      ...vault,
      decryptString: () => {
        throw new Error('test vault locked')
      }
    })
    assert.throws(() => broken.credentials(host.id), /无法解密已保存的密码/)
    assert.equal(fs.readFileSync(store.file, 'utf8'), disk)
    assert.equal(broken.list()[0].hasPassword, true)
    assert.ok(!('password' in broken.list()[0]) && !('secret' in broken.list()[0]))
    broken.upsert({ ...host, note: 'metadata only' })
    assert.equal(broken.get(host.id).secret, store.get(host.id).secret)
    assert.throws(() => broken.credentials(host.id), /无法解密/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rejecting an overlong replacement preserves the existing in-memory password', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-credentials-'))
  try {
    const store = new Store(dir)
    const host = store.upsert(draft('Memory', 'keep-test-only', false))
    const disk = fs.readFileSync(store.file, 'utf8')
    assert.throws(() => store.upsert({ ...host, password: 'x'.repeat(16385) }), /密码过长/)
    assert.equal(store.credentials(host.id).password, 'keep-test-only')
    assert.equal(fs.readFileSync(store.file, 'utf8'), disk)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
