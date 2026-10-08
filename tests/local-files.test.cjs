const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { Files } = require('../electron/files.cjs')
test('native paths, Unicode files, optimistic edits, local transfers and permission preservation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-native-files-'))
  const files = new Files(null)
  try {
    const p = path.join(directory, '中文 space.txt')
    fs.writeFileSync(p, 'line1\r\nline2\r\n')
    if (process.platform !== 'win32') fs.chmodSync(p, 0o640)
    const list = await files.list('local', directory)
    assert.equal(list.separator, path.sep)
    assert.ok(list.entries.some((e) => e.path === p))
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
