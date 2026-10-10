const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { Terminal } = require('@xterm/headless')
const { Unicode11Addon } = require('@xterm/addon-unicode11')
const { Store } = require('../electron/store.cjs')
const definitions = require('../shared/terminal-themes.json')
const filename = path.resolve(__dirname, '../src/lib/output-highlights.ts')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  filename
)
const { highlightSpans } = loaded.exports
const create = () => {
  const term = new Terminal({ cols: 120, rows: 12, allowProposedApi: true })
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  return term
}
const write = (term, data) => new Promise((resolve) => term.write(data, resolve))

test('script ANSI palette, truecolor, bold and underline survive; highlights respect explicit colors', async () => {
  const term = create()
  try {
    await write(
      term,
      '\x1b[31mERROR\x1b[0m ERROR \x1b[38;2;12;34;56mWARN\x1b[0m \x1b[38;5;208mINDEX\x1b[0m \x1b[1;4mSTYLE\x1b[0m'
    )
    const line = term.buffer.active.getLine(0)
    assert.equal(line.getCell(0).getFgColor(), 1)
    assert.equal(line.getCell(12).getFgColor(), 0x0c2238)
    assert.equal(line.getCell(17).getFgColor(), 208)
    assert.ok(line.getCell(23).isBold())
    assert.ok(line.getCell(23).isUnderline())
    assert.deepEqual(highlightSpans(line), [{ x: 6, width: 5, kind: 'error' }])
    assert.equal(line.getCell(6).isFgDefault(), true, 'highlighting must not mutate terminal cells')
  } finally {
    term.dispose()
  }
})
test('highlight cell positions account for CJK, emoji and combining characters', async () => {
  const term = create()
  try {
    await write(term, '中文 ERROR 警告 https://example.test 10.2.3.4 999.1.1.1')
    const spans = highlightSpans(term.buffer.active.getLine(0))
    assert.deepEqual(
      spans.find((s) => s.kind === 'error'),
      { x: 5, width: 5, kind: 'error' }
    )
    assert.deepEqual(
      spans.find((s) => s.kind === 'warning'),
      { x: 11, width: 4, kind: 'warning' }
    )
    assert.equal(spans.filter((s) => s.kind === 'address').length, 1)
    assert.equal(spans.filter((s) => s.kind === 'url').length, 1)
    await write(term, '\r\x1b[2KValueError UserWarning Traceback')
    assert.deepEqual(
      highlightSpans(term.buffer.active.getLine(0))
        .map((s) => s.kind)
        .sort(),
      ['error', 'error', 'warning']
    )
    await write(term, '\r\x1b[2Ke\u0301🙂 ERROR')
    assert.deepEqual(highlightSpans(term.buffer.active.getLine(0)), [{ x: 4, width: 5, kind: 'error' }])
  } finally {
    term.dispose()
  }
})
test('CR and erase update one progress row; newline and alternate screen retain VT semantics', async () => {
  const term = create()
  try {
    await write(term, 'ERROR very long previous message')
    for (const percent of [10, 25, 50, 75, 100]) await write(term, `\r\x1b[2Kprogress ${percent}%`)
    assert.equal(term.buffer.active.cursorY, 0)
    assert.equal(term.buffer.active.getLine(0).translateToString(true), 'progress 100%')
    assert.deepEqual(highlightSpans(term.buffer.active.getLine(0)), [])
    await write(term, '\r\nnext row')
    assert.equal(term.buffer.active.cursorY, 1)
    await write(term, '\x1b[?1049h\x1b[Halternate')
    assert.equal(term.buffer.active.type, 'alternate')
    await write(term, '\x1b[?1049l')
    assert.equal(term.buffer.active.getLine(0).translateToString(true), 'progress 100%')
    assert.equal(term.buffer.active.getLine(1).translateToString(true), 'next row')
  } finally {
    term.dispose()
  }
})
test('theme and highlighting settings persist and reject unknown presets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-themes-'))
  try {
    const store = new Store(directory)
    assert.equal(store.data.settings.copyOnSelect, undefined)
    store.settings({ terminalTheme: 'paper', outputHighlights: false, copyOnSelect: true })
    store.settings({ terminalTheme: 'unknown' })
    const reloaded = new Store(directory)
    assert.equal(reloaded.data.settings.terminalTheme, 'paper')
    assert.equal(reloaded.data.settings.outputHighlights, false)
    assert.equal(reloaded.data.settings.copyOnSelect, true)
    reloaded.settings({ copyOnSelect: 'false' })
    assert.equal(reloaded.data.settings.copyOnSelect, true)
    reloaded.settings({ copyOnSelect: false })
    assert.equal(new Store(directory).data.settings.copyOnSelect, false)
    for (const preset of Object.values(definitions)) {
      assert.equal(preset.palette.length, 16)
      for (const color of [preset.background, preset.foreground, preset.cursor, ...preset.palette])
        assert.match(color, /^#[0-9a-f]{6}$/i)
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

const clipboardFilename = path.resolve(__dirname, '../src/lib/selection-clipboard.ts')
const clipboardModule = new Module(clipboardFilename, module)
clipboardModule._compile(
  ts.transpileModule(fs.readFileSync(clipboardFilename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  clipboardFilename
)
const { SelectionClipboard } = clipboardModule.exports

test('remote clipboard permits one UTF-8 write after selection, rejects reads, stale and malformed data', () => {
  let now = 1000
  const clipboard = new SelectionClipboard(() => now)
  const data = 'c;' + Buffer.from('你好 🌏\nsecond line').toString('base64')
  assert.equal(clipboard.read(data), undefined)
  clipboard.arm()
  assert.equal(clipboard.read('c;?'), undefined)
  assert.equal(clipboard.read('c;'), undefined)
  assert.equal(clipboard.read('c;%%%'), undefined)
  assert.equal(clipboard.read('c;/w=='), undefined)
  assert.equal(clipboard.read('unknown;YQ=='), undefined)
  assert.equal(clipboard.read('c;' + Buffer.alloc(1048577).toString('base64')), undefined)
  assert.equal(clipboard.read(data), '你好 🌏\nsecond line')
  assert.equal(clipboard.read(data), undefined)
  clipboard.arm()
  now += 1501
  assert.equal(clipboard.read(data), undefined)
  clipboard.arm()
  clipboard.cancel()
  assert.equal(clipboard.read(data), undefined)
})
test('OSC 52 selection writes work across SSH chunks without answering clipboard queries', async () => {
  const term = create()
  const clipboard = new SelectionClipboard()
  const copies = [],
    replies = []
  term.onData((data) => replies.push(data))
  term.parser.registerOscHandler(52, (data) => {
    const text = clipboard.read(data)
    if (text) copies.push(text)
    return true
  })
  try {
    await write(term, '\x1b]52;c;?\x07\x1b]52;c;aWdub3JlZA==\x07')
    assert.deepEqual(copies, [])
    clipboard.arm()
    await write(term, '\x1b]52;c;5L2g5aW9')
    await write(term, 'IOa1i+ivlQ==\x1b\\')
    assert.deepEqual(copies, ['你好 测试'])
    await write(term, '\x1b]52;c;?\x07\x1b]52;c;aWdub3JlZA==\x07')
    assert.deepEqual(copies, ['你好 测试'])
    assert.deepEqual(replies, [])
  } finally {
    term.dispose()
  }
})
