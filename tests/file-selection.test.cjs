const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/file-selection.ts')
const loaded = new Module(filename, module)
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  filename
)
const { fileTreeRows, displayedFilePaths, selectFile, visibleSelection } = loaded.exports
const entry = (path, isDirectory = false) => ({ path, name: path.split('/').pop(), isDirectory })
const roots = [entry('/folder', true), entry('/other', true), entry('/last.txt')]
const expanded = {
  '/folder': [
    entry('/folder/nested', true),
    entry('/folder/a.txt'),
    entry('/folder/.hidden'),
    entry('/folder/b.txt'),
    entry('/folder/c.txt')
  ],
  '/folder/nested': [entry('/folder/nested/1.txt'), entry('/folder/nested/2.txt')],
  '/other': [entry('/other/last.txt')],
  '/invisible': [entry('/invisible/child.txt')]
}
const all = displayedFilePaths(fileTreeRows(roots, expanded, false))
const click = (s, target, range = false, toggle = false, paths = all) =>
  selectFile(s, paths, target, { range, toggle })
const empty = () => ({ selected: [], anchor: null })

test('visible file tree follows rendered depth-first order and excludes closed, hidden and unreachable branches', () => {
  const before = JSON.stringify({ roots, expanded })
  assert.deepEqual(all, [
    '/folder',
    '/folder/nested',
    '/folder/nested/1.txt',
    '/folder/nested/2.txt',
    '/folder/a.txt',
    '/folder/b.txt',
    '/folder/c.txt',
    '/other',
    '/other/last.txt',
    '/last.txt'
  ])
  const collapsed = { ...expanded }
  delete collapsed['/folder/nested']
  assert.deepEqual(displayedFilePaths(fileTreeRows(roots, collapsed, false)), [
    '/folder',
    '/folder/nested',
    '/folder/a.txt',
    '/folder/b.txt',
    '/folder/c.txt',
    '/other',
    '/other/last.txt',
    '/last.txt'
  ])
  assert.ok(displayedFilePaths(fileTreeRows(roots, expanded, true)).includes('/folder/.hidden'))
  assert.deepEqual(displayedFilePaths(fileTreeRows([roots[1]], expanded, false)), [
    '/other',
    '/other/last.txt'
  ])
  assert.equal(JSON.stringify({ roots, expanded }), before)
})
test('Shift selects a contiguous range inside an expanded folder', () => {
  const s = click(click(empty(), '/folder/a.txt'), '/folder/c.txt', true)
  assert.deepEqual(s, {
    selected: ['/folder/a.txt', '/folder/b.txt', '/folder/c.txt'],
    anchor: '/folder/a.txt'
  })
})
test('Shift ranges span multiple expanded levels and sibling branches in either direction', () => {
  const expected = [
    '/folder/nested/2.txt',
    '/folder/a.txt',
    '/folder/b.txt',
    '/folder/c.txt',
    '/other',
    '/other/last.txt'
  ]
  assert.deepEqual(click(click(empty(), expected[0]), expected.at(-1), true).selected, expected)
  assert.deepEqual(click(click(empty(), expected.at(-1)), expected[0], true).selected, expected)
})
test('reverse ranges can shrink, extend and repeat without moving the initial anchor', () => {
  let s = click(empty(), '/folder/c.txt')
  s = click(s, '/folder/a.txt', true)
  assert.deepEqual(s.selected, ['/folder/a.txt', '/folder/b.txt', '/folder/c.txt'])
  s = click(s, '/folder/b.txt', true)
  assert.deepEqual(s.selected, ['/folder/b.txt', '/folder/c.txt'])
  s = click(s, '/other', true)
  assert.deepEqual(s.selected, ['/folder/c.txt', '/other'])
  assert.equal(s.anchor, '/folder/c.txt')
  assert.deepEqual(click(s, '/other', true), s)
})
test('Ctrl/Command toggles files and the next Shift range uses the last clicked anchor', () => {
  let s = click(click(empty(), '/folder/a.txt'), '/folder/c.txt', false, true)
  assert.deepEqual(s.selected, ['/folder/a.txt', '/folder/c.txt'])
  s = click(s, '/folder/b.txt', true)
  assert.deepEqual(s.selected, ['/folder/b.txt', '/folder/c.txt'])
  s = click(s, '/folder/c.txt', false, true)
  assert.deepEqual(s.selected, ['/folder/b.txt'])
  assert.deepEqual(click(s, '/other', true).selected, ['/folder/c.txt', '/other'])
})
test('hidden, collapsed or missing anchors cannot create an index -1 range', () => {
  const s = click(empty(), '/folder/nested/1.txt')
  const paths = ['/folder', '/folder/a.txt', '/folder/b.txt']
  assert.deepEqual(visibleSelection(s, paths), empty())
  assert.deepEqual(click(s, '/folder/b.txt', true, false, paths), {
    selected: ['/folder/b.txt'],
    anchor: '/folder/b.txt'
  })
  assert.deepEqual(click(s, '/missing', true, false, paths), empty())
  const kept = click(empty(), '/folder/a.txt')
  assert.equal(visibleSelection(kept, all), kept)
})
test('flat lists use their current filtered or sorted display order', () => {
  const entries = [entry('/c'), entry('/b'), entry('/a')]
  const paths = displayedFilePaths(fileTreeRows(entries, {}, false))
  assert.deepEqual(click(click(empty(), '/c', false, false, paths), '/a', true, false, paths).selected, [
    '/c',
    '/b',
    '/a'
  ])
  assert.deepEqual(
    click(click(empty(), '/a', false, false, ['/a', '/c']), '/c', true, false, ['/a', '/c']).selected,
    ['/a', '/c']
  )
})
test('cyclic canonical directory listings do not recurse indefinitely and ranges contain unique paths', () => {
  const folder = entry('/folder', true)
  const paths = displayedFilePaths(
    fileTreeRows([folder, entry('/last.txt')], { '/folder': [folder, entry('/child.txt')] }, false)
  )
  assert.deepEqual(paths, ['/folder', '/folder', '/child.txt', '/last.txt'])
  assert.deepEqual(
    click(click(empty(), '/folder', false, false, paths), '/last.txt', true, false, paths).selected,
    ['/folder', '/child.txt', '/last.txt']
  )
})
