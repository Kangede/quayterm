const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(file) {
  const filename = path.resolve(__dirname, '../src/lib', file)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(source, filename)
  return loaded.exports
}
const { initialWorkspace, changeLayout, addTab, removeTab, moveTab, layouts } = load('workspace.ts')
const { parseQuickConnect } = load('quick-connect.ts')
test('layout changes and cross-pane moves preserve exactly one owner for every session', () => {
  let w = initialWorkspace()
  const expected = Array.from({ length: 16 }, (_, i) => `session-${i}`)
  for (const id of expected) w = addTab(w, id)
  for (let round = 0; round < 15; round++)
    for (const layout of layouts) {
      w = changeLayout(w, layout.id)
      for (let i = 0; i < expected.length; i++) w = moveTab(w, expected[i], w.panes[i % w.panes.length].id)
      assert.equal(w.panes.length, layout.count)
      assert.deepEqual(w.panes.flatMap((p) => p.tabs).sort(), [...expected].sort())
      for (const p of w.panes) assert.ok(p.active === null ? p.tabs.length === 0 : p.tabs.includes(p.active))
      assert.ok(w.panes.some((p) => p.id === w.focused))
    }
})
test('reordering within a pane and removing an active tab select a valid neighbor', () => {
  let w = initialWorkspace()
  w = addTab(w, 'a')
  w = addTab(w, 'b')
  w = addTab(w, 'c')
  w = moveTab(w, 'c', w.focused, 'a')
  assert.deepEqual(w.panes[0].tabs, ['c', 'a', 'b'])
  assert.equal(w.panes[0].active, 'c')
  w = removeTab(w, 'c')
  assert.equal(w.panes[0].active, 'a')
  w = removeTab(removeTab(w, 'a'), 'b')
  assert.equal(w.panes[0].active, null)
  assert.equal(moveTab(w, 'missing', 'missing'), w)
})
test('quick connection parser covers SSH, ports, IPv6 and rejects shell command strings', () => {
  assert.deepEqual(parseQuickConnect('ssh root@10.0.0.1 -p 2222'), {
    name: '10.0.0.1',
    address: '10.0.0.1',
    username: 'root',
    port: 2222
  })
  assert.equal(parseQuickConnect('ssh://u@[::1]:2200').address, '::1')
  assert.equal(parseQuickConnect('u@host:0'), null)
  assert.equal(parseQuickConnect('u@host:65536'), null)
  assert.equal(parseQuickConnect('ssh u@host && touch file'), null)
})
