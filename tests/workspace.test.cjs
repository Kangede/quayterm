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
const {
  initialWorkspace,
  changeLayout,
  addTab,
  removeTab,
  moveTab,
  dockTab,
  resizeSplit,
  workspaceGeometry,
  layouts
} = load('workspace.ts')
const { parseQuickConnect } = load('quick-connect.ts')
test('layout changes and cross-pane moves preserve exactly one owner for every session', () => {
  let w = initialWorkspace()
  const expected = Array.from({ length: 16 }, (_, i) => `session-${i}`)
  for (const id of expected) w = addTab(w, id)
  for (let round = 0; round < 15; round++)
    for (const layout of layouts) {
      w = changeLayout(w, layout.id)
      assert.equal(w.panes.length, layout.count)
      for (let i = 0; i < expected.length; i++) w = moveTab(w, expected[i], w.panes[i % w.panes.length].id)
      assert.ok(w.panes.length <= layout.count)
      assert.ok(w.panes.every((p) => p.tabs.length || p.keepEmpty))
      assert.deepEqual(w.panes.flatMap((p) => p.tabs).sort(), [...expected].sort())
      for (const p of w.panes) assert.ok(p.active === null ? p.tabs.length === 0 : p.tabs.includes(p.active))
      assert.ok(w.panes.some((p) => p.id === w.focused))
    }
})
function valid(w, sessions) {
  assert.deepEqual(w.panes.flatMap((p) => p.tabs).sort(), [...sessions].sort())
  const geometry = workspaceGeometry(w.tree)
  assert.deepEqual([...geometry.panes.keys()].sort(), w.panes.map((p) => p.id).sort())
  assert.equal(geometry.splits.length, w.panes.length - 1)
  assert.ok(w.panes.some((p) => p.id === w.focused))
  for (const p of w.panes) assert.ok(p.active === null ? !p.tabs.length : p.tabs.includes(p.active))
  assert.ok(Math.abs([...geometry.panes.values()].reduce((n, p) => n + p.width * p.height, 0) - 1) < 1e-10)
}
test('docking all four edges splits the target in the requested direction without duplicating sessions', () => {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const w = addTab(addTab(initialWorkspace(), 'a'), 'b')
    const original = structuredClone(w)
    const next = dockTab(w, 'b', w.focused, side)
    valid(next, ['a', 'b'])
    assert.deepEqual(w, original)
    const g = workspaceGeometry(next.tree).panes
    const a = g.get(w.focused),
      b = g.get(next.focused)
    if (side === 'left') assert.ok(b.left < a.left)
    if (side === 'right') assert.ok(b.left > a.left)
    if (side === 'top') assert.ok(b.top < a.top)
    if (side === 'bottom') assert.ok(b.top > a.top)
    assert.equal(next.layout, ['left', 'right'].includes(side) ? 'columns' : 'rows')
    assert.equal(removeTab(next, 'b').layout, 'single')
  }
})
test('manual vacancies survive until used; used panes collapse when closed or moved out', () => {
  let w = changeLayout(addTab(initialWorkspace(), 'a'), 'grid')
  const ids = w.panes.map((p) => p.id)
  w = addTab(w, 'b', ids[1])
  w = removeTab(w, 'b')
  assert.equal(w.panes.length, 3)
  assert.ok(w.panes.some((p) => p.id === ids[2] && p.keepEmpty))
  assert.ok(w.panes.some((p) => p.id === ids[3] && p.keepEmpty))
  w = moveTab(w, 'a', ids[2])
  assert.equal(w.panes.length, 2)
  assert.equal(w.focused, ids[2])
  assert.equal(w.panes.find((p) => p.id === ids[2]).keepEmpty, false)
  w = removeTab(w, 'a')
  assert.equal(w.panes.length, 1)
  assert.equal(w.panes[0].id, ids[3])
  valid(w, [])
  w = removeTab(addTab(w, 'last'), 'last')
  assert.equal(w.panes.length, 1)
  valid(w, [])
})
test('docking and closing nested panes preserve surviving split sizes and manual presets', () => {
  let w = initialWorkspace()
  for (const id of ['a', 'b', 'c', 'd', 'e']) w = addTab(w, id)
  const rootPane = w.focused
  w = dockTab(w, 'b', rootPane, 'right')
  const right = w.focused
  w = resizeSplit(w, w.tree.id, 0.37)
  w = dockTab(w, 'c', right, 'bottom')
  const bottom = w.focused
  w = dockTab(w, 'd', rootPane, 'top')
  w = dockTab(w, 'e', bottom, 'left')
  valid(w, ['a', 'b', 'c', 'd', 'e'])
  assert.equal(w.panes.length, 5)
  assert.equal(w.layout, 'custom')
  w = removeTab(w, 'e')
  assert.equal(w.tree.ratio, 0.37)
  w = moveTab(w, 'd', rootPane, 'a')
  assert.equal(w.layout, 'right')
  assert.deepEqual(w.panes.find((p) => p.id === rootPane).tabs, ['d', 'a'])
  w = removeTab(w, 'c')
  assert.equal(w.layout, 'columns')
  assert.equal(w.tree.ratio, 0.37)
  valid(w, ['a', 'b', 'd'])
  for (const layout of layouts) {
    w = changeLayout(w, layout.id)
    assert.equal(w.panes.length, layout.count)
    valid(w, ['a', 'b', 'd'])
  }
})
test('single-tab self drops and stale drag targets are harmless; empty targets are filled', () => {
  let w = addTab(initialWorkspace(), 'a')
  assert.equal(dockTab(w, 'a', w.focused, 'left'), w)
  assert.equal(dockTab(w, 'a', 'missing', 'left'), w)
  assert.equal(dockTab(w, 'missing', w.focused, 'left'), w)
  const id = w.focused
  w = moveTab(w, 'a', id)
  assert.equal(w.focused, id)
  w = changeLayout(w, 'columns')
  const target = w.panes[1].id
  w = dockTab(w, 'a', target, 'bottom')
  assert.equal(w.panes.length, 1)
  assert.equal(w.focused, target)
  valid(w, ['a'])
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
