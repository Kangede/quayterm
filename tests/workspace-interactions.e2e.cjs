const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { fixture } = require('./fixture.cjs')
let app, page, fx, directory, errors
const evidence = path.resolve('.private/qa/20261010-workspace')
const executable = process.env.QUAYTERM_TEST_EXECUTABLE

test.beforeEach(async () => {
  errors = []
  fs.mkdirSync(evidence, { recursive: true })
  fx = await fixture()
  fs.mkdirSync(path.join(fx.root, 'documents', 'nested'))
  fs.writeFileSync(path.join(fx.root, 'documents', 'nested', 'inside.txt'), 'nested fixture')
  for (let i = 0; i < 45; i++) fs.writeFileSync(path.join(fx.root, 'documents', `row-${i}.txt`), 'row')
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-workspace-'))
  app = await electron.launch({
    chromiumSandbox: Boolean(executable),
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: executable ? [] : [path.resolve(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, QUAYTERM_DATA_DIR: directory }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  if (executable) {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
  }
  await page.getByRole('button', { name: '远程主机', exact: true }).waitFor()
  for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta'])
    await page.evaluate((host) => window.quay.invoke('hostSave', host), { ...fx.host, name })
  await page.reload()
  await expect(page.locator('.host-card')).toHaveCount(4)
})
test.afterEach(async ({}, info) => {
  if (page && info.status !== info.expectedStatus) {
    await page
      .screenshot({
        path: path.join(evidence, `${info.title.replace(/[^a-z0-9]/gi, '-').slice(0, 100)}-failed.png`)
      })
      .catch(() => {})
    console.log(
      (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(-5000)
    )
  }
  if (app) {
    await app
      .evaluate(({ app, clipboard }) => {
        clipboard.clear()
        app.exit()
      })
      .catch(() => {})
    await app.close().catch(() => {})
  }
  await fx?.close()
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  expect(errors).toEqual([])
})
const panes = () => page.locator('.terminal-pane')
const tab = (name) => page.getByRole('tab', { name: new RegExp(`^${name}`) })
const rows = () => page.locator('.terminal-pane.focused .xterm-rows')
const filePath = () => page.getByRole('textbox', { name: '侧栏文件路径', exact: true })
async function connect(name) {
  await page.getByRole('button', { name: '主机', exact: true }).click()
  await page.locator('.host-card').filter({ hasText: name }).dblclick()
  const trust = page.getByRole('button', { name: '信任并连接', exact: true })
  await Promise.race([
    trust.waitFor({ state: 'visible' }).then(() => trust.click()),
    rows().getByText('quay-test$', { exact: false }).waitFor()
  ]).catch(() => {})
  await expect(rows()).toContainText('quay-test$')
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
}
async function command(text) {
  await page.locator('.terminal-pane.focused .xterm-helper-textarea').focus()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}
async function layout(name) {
  await page.getByRole('button', { name: '终端布局', exact: true }).click()
  await page.getByText(name, { exact: true }).click()
}
async function drag(name, target, side) {
  const box = await target.boundingBox()
  const positions = {
    left: { x: 12, y: box.height / 2 },
    right: { x: box.width - 12, y: box.height / 2 },
    top: { x: box.width / 2, y: 50 },
    bottom: { x: box.width / 2, y: box.height - 12 },
    center: { x: box.width / 2, y: box.height / 2 }
  }
  await tab(name).dragTo(target, { targetPosition: positions[side] })
  await expect(page.locator('.drop-hint')).toHaveCount(0)
}
async function close(name, cancel = false) {
  await tab(name)
    .getByRole('button', { name: `关闭会话 ${name}`, exact: true })
    .click()
  await page.getByRole('button', { name: cancel ? '取消' : '断开', exact: true }).click()
  await expect(page.locator('.ant-modal-confirm')).toHaveCount(0)
}
async function toggleCopy() {
  await page.locator('.terminal-pane.focused').getByRole('button', { name: '终端操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '选中文本后自动复制', exact: true }).click()
  await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
}
const readClipboard = () => app.evaluate(({ clipboard }) => clipboard.readText())
const writeClipboard = (text) => app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text)

test('file sidebar remembers each SSH session, nested expansions, scroll and navigation across hiding and moves', async () => {
  await connect('Alpha')
  const side = page.locator('.terminal-files')
  await side.getByRole('button', { name: '展开 documents', exact: true }).click()
  await side.getByRole('button', { name: '展开 nested', exact: true }).click()
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  await connect('Beta')
  await side.locator('.file-row[data-path$="/documents"]').dblclick()
  await expect(filePath()).toHaveValue(path.join(fx.root, 'documents'))
  await side.getByRole('button', { name: '展开 nested', exact: true }).click()
  await side.locator('.file-rows').evaluate((e) => {
    e.scrollTop = 420
  })
  await expect.poll(() => side.locator('.file-rows').evaluate((e) => e.scrollTop)).toBe(420)
  await tab('Alpha').click()
  await expect(filePath()).toHaveValue(fx.root)
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  await tab('Beta').click()
  await expect(filePath()).toHaveValue(path.join(fx.root, 'documents'))
  await expect.poll(() => side.locator('.file-rows').evaluate((e) => e.scrollTop)).toBe(420)
  await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
  await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
  await expect(filePath()).toHaveValue(path.join(fx.root, 'documents'))
  await expect.poll(() => side.locator('.file-rows').evaluate((e) => e.scrollTop)).toBe(420)
  await side.getByRole('button', { name: '返回上一目录', exact: true }).click()
  await expect(filePath()).toHaveValue(fx.root)
  await side.locator('.file-row[data-path$="/hello.txt"]').dblclick()
  const editor = page.getByRole('textbox', { name: '文件编辑器' })
  await editor.fill('changed from Beta\n')
  await editor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await expect
    .poll(() => fs.readFileSync(path.join(fx.root, 'hello.txt'), 'utf8'))
    .toBe('changed from Beta\n')
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(page.locator('.file-editor-modal')).toHaveCount(0)
  fs.writeFileSync(path.join(fx.root, 'documents', 'nested', 'added-after-save.txt'), 'new branch entry')
  await tab('Alpha').click()
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  await side.getByRole('button', { name: '刷新文件', exact: true }).click()
  await expect(side.locator('.anticon-spin')).toHaveCount(0)
  await expect(side.locator('.file-row[data-path$="/added-after-save.txt"]')).toBeVisible()
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  await drag('Alpha', panes().first(), 'right')
  await expect(panes()).toHaveCount(2)
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  await page.getByRole('button', { name: 'SFTP', exact: true }).click()
  await page.locator('.workspace-tab').click()
  await expect(side.locator('.file-row[data-path$="/inside.txt"]')).toBeVisible()
  expect(fx.shells.length).toBe(2)
  await page.screenshot({ path: path.join(evidence, 'sidebar-state.png') })
})

test('edge docking covers four directions, nested layouts, resizing, tab order and original SSH identities', async () => {
  for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
    await connect(name)
    await command(`printf '${name}_SESSION_MARKER\\n'`)
    await expect(rows()).toContainText(`${name}_SESSION_MARKER`)
  }
  const identities = await page
    .locator('.terminal-mount')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.sessionId))
  const originalPane = await panes().first().getAttribute('data-pane')
  const target = () => page.locator(`[data-pane="${originalPane}"]`)
  for (const side of ['left', 'right', 'top', 'bottom']) {
    await drag('Delta', target(), side)
    await expect(panes()).toHaveCount(2)
    const a = await target().boundingBox()
    const b = await tab('Delta').locator('..').locator('..').locator('..').boundingBox()
    if (side === 'left') expect(b.x + b.width).toBeLessThanOrEqual(a.x + 5)
    if (side === 'right') expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 5)
    if (side === 'top') expect(b.y + b.height).toBeLessThanOrEqual(a.y + 5)
    if (side === 'bottom') expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 5)
    await expect(rows()).toContainText('Delta_SESSION_MARKER')
    await drag('Delta', target(), 'center')
    await expect(panes()).toHaveCount(1)
    expect(fx.shells.length).toBe(4)
  }
  await drag('Beta', target(), 'right')
  const rightPane = page.locator('.terminal-pane').filter({ has: tab('Beta') })
  await drag('Gamma', rightPane, 'bottom')
  await drag('Delta', target(), 'top')
  await expect(panes()).toHaveCount(4)
  const divider = page.getByRole('separator', { name: '调整左右面板', exact: true }).first()
  const box = await divider.boundingBox()
  const before = await target().boundingBox()
  // Stay away from the crossing with the horizontal resize handle.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x - 80, box.y + box.height * 0.3, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await target().boundingBox()).width).toBeLessThan(before.width - 50)
  const horizontal = await page
    .getByRole('separator', { name: '调整上下面板', exact: true })
    .first()
    .boundingBox()
  const oldHeight = (await target().boundingBox()).height
  await page.mouse.move(horizontal.x + horizontal.width / 2, horizontal.y + horizontal.height / 2)
  await page.mouse.down()
  await page.mouse.move(horizontal.x + horizontal.width / 2, horizontal.y - 50, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await target().boundingBox()).height).toBeGreaterThan(oldHeight + 30)
  await expect.poll(() => fx.sizes.length).toBeGreaterThan(4)
  for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
    await tab(name).click()
    await expect(rows()).toContainText(`${name}_SESSION_MARKER`)
  }
  await page.screenshot({ path: path.join(evidence, 'nested-docking.png') })
  for (const preset of ['单一', '双列', '三列', '双行', '三行', '网格 2×2', '右侧双行', '底部双列', '单一'])
    await layout(preset)
  await expect(page.getByRole('tab')).toHaveCount(4)
  await tab('Delta').dragTo(tab('Alpha'))
  expect(await page.locator('.pane-tab').first().innerText()).toContain('Delta')
  expect(fx.shells.length).toBe(4)
  // Every SSH terminal retains its original element and session identifier.
  await tab('Delta').click()
  expect(await page.locator('.terminal-mount').getAttribute('data-session-id')).toBe(identities[0])
})

test('closing or moving the last session removes used panes while manual vacancies remain', async () => {
  await connect('Alpha')
  await connect('Beta')
  await layout('网格 2×2')
  const originalIds = await panes().evaluateAll((nodes) => nodes.map((n) => n.dataset.pane))
  await drag('Beta', panes().nth(1), 'center')
  await close('Beta', true)
  await expect(panes()).toHaveCount(4)
  await close('Beta')
  await expect(panes()).toHaveCount(3)
  for (const id of originalIds.slice(2))
    await expect(page.locator(`[data-pane="${id}"] .empty-terminal`)).toBeVisible()
  await drag('Alpha', page.locator(`[data-pane="${originalIds[2]}"]`), 'center')
  await expect(panes()).toHaveCount(2)
  await close('Alpha')
  await expect(panes()).toHaveCount(1)
  await expect(page.locator('.empty-terminal')).toBeVisible()
  await connect('Gamma')
  const same = await panes().first().getAttribute('data-pane')
  await drag('Gamma', panes().first(), 'right')
  await expect(panes()).toHaveCount(1)
  expect(await panes().first().getAttribute('data-pane')).toBe(same)
  await close('Gamma')
  await expect(panes()).toHaveCount(1)
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(fx.shells.length).toBe(3)
})

test('reconnecting a sole session preserves its pane and split size', async () => {
  await connect('Alpha')
  await connect('Beta')
  await drag('Beta', panes().first(), 'right')
  const id = await page.locator('.terminal-pane.focused').getAttribute('data-pane')
  const before = await page.locator('.terminal-pane.focused').boundingBox()
  await command('exit')
  await expect(page.locator('.terminal-pane.focused .connection-overlay.ended')).toBeVisible()
  await page.getByRole('button', { name: /重新连接/ }).click()
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
  await expect(rows()).toContainText('quay-test$')
  await expect(panes()).toHaveCount(2)
  expect(await page.locator('.terminal-pane.focused').getAttribute('data-pane')).toBe(id)
  expect((await page.locator('.terminal-pane.focused').boundingBox()).width).toBeCloseTo(before.width, 0)
  await expect.poll(() => fx.shells.length).toBe(3)
})

test('real tmux mouse selections auto-copy without modifiers and preserve reporting; unsolicited OSC 52 stays blocked', async () => {
  await connect('Alpha')
  await toggleCopy()
  const tmux = process.env.QUAYTERM_TMUX || path.resolve('.private/tooling/usr/bin/tmux')
  const lib = path.resolve('.private/tooling/usr/lib/x86_64-linux-gnu')
  const ctl = (...args) => {
    const result = spawnSync(tmux, ['-S', path.join(fx.root, 'tmux.sock'), ...args], {
      env: { ...process.env, LD_LIBRARY_PATH: lib },
      encoding: 'utf8',
      timeout: 3000
    })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout
  }
  fs.appendFileSync(path.join(fx.root, 'tmux.conf'), 'set -g mouse on\n')
  await command(
    `LD_LIBRARY_PATH='${lib}' '${tmux}' -S '${fx.root}/tmux.sock' -f '${fx.root}/tmux.conf' new-session -s quayterm-test`
  )
  await expect(rows()).toContainText('quayterm-test')
  await command("printf '\\033[2J\\033[HTMUX_SELECT_你好_12345\\n'")
  await expect(rows()).toContainText('TMUX_SELECT_你好_12345')
  const screen = page.locator('.terminal-pane.focused .xterm-screen')
  const box = await screen.boundingBox()
  const line = page.locator('.terminal-pane.focused .xterm-rows > div').first()
  const lineBox = await line.boundingBox()
  const select = async (modifier) => {
    await page.mouse.move(box.x + 1, lineBox.y + lineBox.height / 2)
    if (modifier) await page.keyboard.down(modifier)
    await page.mouse.down()
    await page.mouse.move(box.x + 245, lineBox.y + lineBox.height / 2, { steps: 15 })
    await page.mouse.up()
    if (modifier) await page.keyboard.up(modifier)
  }
  await writeClipboard('tmux-before')
  const offset = fx.inputs.length
  await select()
  await expect.poll(readClipboard).toContain('TMUX_SELECT_你好_12345')
  expect(Buffer.concat(fx.inputs.slice(offset)).toString()).toMatch(/\x1b\[<0;/)
  expect(ctl('show-buffer')).toContain('TMUX_SELECT_你好_12345')
  await writeClipboard('shift-before')
  const shiftOffset = fx.inputs.length
  await select('Shift')
  await expect.poll(readClipboard).toContain('TMUX_SELECT_你好_12345')
  expect(Buffer.concat(fx.inputs.slice(shiftOffset)).toString()).not.toMatch(/\x1b\[(?:M|<)/)
  await writeClipboard('repeat-same-range')
  await select('Shift')
  await expect.poll(readClipboard).toContain('TMUX_SELECT_你好_12345')
  if (process.platform === 'darwin') {
    await writeClipboard('option-before')
    const optionOffset = fx.inputs.length
    await select('Alt')
    await expect.poll(readClipboard).toContain('TMUX_SELECT_你好_12345')
    expect(Buffer.concat(fx.inputs.slice(optionOffset)).toString()).not.toMatch(/\x1b\[(?:M|<)/)
  }
  // Local selection remains available even if tmux disables OSC 52.
  ctl('set-option', '-s', 'set-clipboard', 'off')
  await writeClipboard('tmux-clipboard-off')
  const localOffset = fx.inputs.length
  await select('Shift')
  await expect.poll(readClipboard).toContain('TMUX_SELECT_你好_12345')
  expect(Buffer.concat(fx.inputs.slice(localOffset)).toString()).not.toMatch(/\x1b\[(?:M|<)/)
  ctl('set-option', '-s', 'set-clipboard', 'external')
  // No active gesture: a server cannot overwrite or read the system clipboard.
  await writeClipboard('guarded-sentinel')
  const forbidden = '\x1b]52;c;' + Buffer.from('UNSOLICITED').toString('base64') + '\x07'
  const queryOffset = fx.inputs.length
  fx.output(forbidden + '\x1b]52;c;?\x07AFTER_OSC_GUARD')
  await expect(rows()).toContainText('AFTER_OSC_GUARD')
  expect(await readClipboard()).toBe('guarded-sentinel')
  expect(Buffer.concat(fx.inputs.slice(queryOffset)).toString()).not.toContain('\x1b]52;')
  const clickOffset = fx.inputs.length
  await screen.click({ position: { x: 4, y: 8 } })
  await expect.poll(() => Buffer.concat(fx.inputs.slice(clickOffset)).toString()).toMatch(/\x1b\[<0;/)
  fx.output(forbidden + 'AFTER_CLICK_GUARD')
  await expect(rows()).toContainText('AFTER_CLICK_GUARD')
  expect(await readClipboard()).toBe('guarded-sentinel')
  await toggleCopy()
  await writeClipboard('disabled-tmux')
  await select()
  await page.waitForTimeout(200)
  expect(await readClipboard()).toBe('disabled-tmux')
  await toggleCopy()
  await screen.hover()
  const wheelOffset = fx.inputs.length
  await page.mouse.wheel(0, -180)
  await expect.poll(() => Buffer.concat(fx.inputs.slice(wheelOffset)).toString()).toMatch(/\x1b\[<64;/)
  await page.screenshot({ path: path.join(evidence, 'tmux-selection.png') })
})
