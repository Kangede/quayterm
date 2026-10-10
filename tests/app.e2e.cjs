const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { fixture } = require('./fixture.cjs')
const commandModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const terminalModifier = process.platform === 'darwin' ? 'Meta' : 'Control+Shift'
let app,
  page,
  fx,
  data,
  errors = []
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  fx = await fixture()
  data = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'quayterm-e2e-'))
  const seed = path.join(data, 'seed.json')
  fs.writeFileSync(
    seed,
    JSON.stringify([
      { ...fx.host, name: '测试主机 Alpha' },
      { ...fx.host, name: '测试主机 Beta', color: '#6789c9', tags: ['开发'] }
    ])
  )
  app = await electron.launch({
    chromiumSandbox: Boolean(process.env.QUAYTERM_TEST_EXECUTABLE),
    ...(process.env.QUAYTERM_TEST_EXECUTABLE
      ? { executablePath: path.resolve(process.env.QUAYTERM_TEST_EXECUTABLE) }
      : {}),
    args: process.env.QUAYTERM_TEST_EXECUTABLE ? [] : [path.resolve(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, QUAYTERM_DATA_DIR: data, QUAYTERM_TEST_SEED: seed }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  if (process.env.QUAYTERM_TEST_EXECUTABLE) {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
    await page.getByRole('button', { name: '远程主机', exact: true }).waitFor()
    for (const host of JSON.parse(fs.readFileSync(seed, 'utf8')))
      await page.evaluate((host) => window.quay.invoke('hostSave', host), host)
    await page.reload()
  }
  await expect(page.locator('.host-card')).toHaveCount(2)
})
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page) {
    await page.screenshot({ path: '.private/e2e-failed.png' }).catch(() => {})
    console.log(
      (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(-7000)
    )
  }
})
test.afterAll(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit())
    await app.close().catch(() => {})
  }
  await fx?.close()
  if (data) fs.rmSync(data, { recursive: true, force: true })
})
async function hostPage() {
  await page.getByRole('button', { name: '主机', exact: true }).click()
  await page.getByRole('button', { name: '远程主机', exact: true }).click()
}
async function connect(name) {
  await hostPage()
  await page.locator('.host-card').filter({ hasText: name }).dblclick()
  const trust = page.getByRole('button', { name: '信任并连接' })
  if (await trust.isVisible({ timeout: 1500 }).catch(() => false)) await trust.click()
  else {
    await Promise.race([
      trust.waitFor({ state: 'visible', timeout: 2000 }).then(() => trust.click()),
      page
        .locator('.terminal-pane.focused .xterm-rows')
        .getByText('quay-test$', { exact: false })
        .first()
        .waitFor({ timeout: 2000 })
    ]).catch(() => {})
  }
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('quay-test$')
}
async function input(text) {
  const term = page.locator('.terminal-pane.focused .xterm-helper-textarea')
  await term.focus()
  for (const [i, chunk] of text.split('\r').entries()) {
    if (i) await page.keyboard.press('Enter')
    if (chunk) await page.keyboard.type(chunk)
  }
}
async function press(key) {
  await page.locator('.terminal-pane.focused .xterm-helper-textarea').focus()
  await page.keyboard.press(key)
}
test('host grid, right editor, display controls and persisted changes', async () => {
  await page.getByRole('button', { name: '显示方式', exact: true }).click()
  await page.getByText('列表', { exact: true }).click()
  await expect(page.locator('.host-grid')).toHaveClass(/list/)
  await page.locator('.host-card').filter({ hasText: 'Alpha' }).hover()
  await page.getByRole('button', { name: '编辑 测试主机 Alpha', exact: true }).click()
  await page.getByRole('textbox', { name: '主机备注', exact: true }).fill('集成测试备注')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.host-editor')).toHaveCount(0)
  await page.getByRole('button', { name: '显示方式', exact: true }).click()
  await page.getByText('表格', { exact: true }).click()
  const disk = JSON.parse(fs.readFileSync(path.join(data, 'quayterm.json')))
  expect(disk.hosts.find((h) => h.name.includes('Alpha')).note).toBe('集成测试备注')
  expect(JSON.stringify(disk)).not.toContain('fixture-password')
  await page.screenshot({ path: '.private/hosts.png' })
})
test('real SSH renders Unicode, ANSI color, control keys, clipboard and search', async () => {
  await connect('Alpha')
  await expect(page.locator('.terminal-files')).toBeVisible()
  await input("printf '\\033[32mUTF8 你好 ✓\\033[0m\\n'\r")
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('UTF8 你好 ✓')
  await expect(page.locator('.terminal-pane.focused .xterm-fg-2')).toContainText(['UTF8'])
  const offset = fx.inputs.length
  await press('Control+b')
  await press('Control+a')
  await press('Control+c')
  await press('Tab')
  await press('ArrowUp')
  await press('Control+c')
  await expect
    .poll(() => {
      const input = Buffer.concat(fx.inputs.slice(offset))
      return [1, 2, 3, 9].every((byte) => input.includes(byte)) && input.toString().includes('\x1b[A')
    })
    .toBeTruthy()
  const bytes = Buffer.concat(fx.inputs.slice(offset))
  expect(bytes.includes(1)).toBeTruthy()
  expect(bytes.includes(3)).toBeTruthy()
  expect(bytes.includes(9)).toBeTruthy()
  expect(bytes.toString()).toContain('\x1b[A')
  await app.evaluate(({ clipboard }) => clipboard.writeText('printf "PASTE_OK\\n"'))
  await press(`${terminalModifier}+V`)
  await press('Enter')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('PASTE_OK')
  // macOS ships Bash 3.2, which does not negotiate bracketed paste. Enable
  // the protocol explicitly, verify the actual SSH bytes, then discard the
  // probe without asking that older shell to interpret the wrapper.
  fx.output('\x1b[?2004hBRACKETED_PASTE_READY\r\n')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('BRACKETED_PASTE_READY')
  await app.evaluate(({ clipboard }) => clipboard.writeText('BRACKETED_PASTE_PROBE'))
  const pasteOffset = fx.inputs.length
  await press(`${terminalModifier}+V`)
  await expect
    .poll(() => Buffer.concat(fx.inputs.slice(pasteOffset)).toString())
    .toContain('\x1b[200~BRACKETED_PASTE_PROBE\x1b[201~')
  await press('Control+c')
  fx.output('\x1b[?2004l')
  await press(`${terminalModifier}+F`)
  await page.getByRole('textbox', { name: '终端搜索词' }).fill('PASTE_OK')
  await page.getByRole('button', { name: '关闭终端查找' }).click()
  await press(`${commandModifier}+Shift+B`)
  await expect(page.locator('.terminal-files')).toHaveCount(0)
  await press(`${commandModifier}+Shift+B`)
  await expect(page.locator('.terminal-files')).toBeVisible()
  await page.screenshot({ path: '.private/terminal.png' })
})
test('independent pane tabs, new connection shortcut, drag movement and layout folding preserve sessions', async () => {
  await page.getByRole('button', { name: '终端布局' }).click()
  await page.getByText('双列', { exact: true }).click()
  await expect(page.locator('.terminal-pane')).toHaveCount(2)
  await page.locator('.terminal-pane').nth(1).getByRole('button', { name: '面板添加会话' }).click()
  await page.locator('.recent-hosts button').filter({ hasText: 'Beta' }).click()
  await expect(page.locator('.terminal-pane').nth(1).locator('.connection-overlay')).toHaveCount(0)
  await press(`${commandModifier}+Shift+T`)
  await expect(page.locator('.new-screen')).toBeVisible()
  await page.locator('.recent-hosts button').filter({ hasText: 'Alpha' }).click()
  await expect(page.locator('.terminal-pane').nth(1).locator('.pane-tab')).toHaveCount(2)
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
  await page.locator('.terminal-pane').nth(0).getByRole('button', { name: '面板添加会话' }).click()
  await page.locator('.recent-hosts button').filter({ hasText: 'Beta' }).click()
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
  await expect(page.locator('.terminal-pane').nth(0).locator('.pane-tab')).toHaveCount(2)
  await expect(page.locator('.terminal-pane').nth(1).locator('.pane-tab')).toHaveCount(2)
  await expect.poll(() => fx.shells.length).toBe(4)
  await page.screenshot({ path: '.private/two-tabs-per-pane.png' })
  const shells = fx.shells.length
  const source = page.locator('.terminal-pane').nth(1).locator('.pane-tab').filter({ hasText: 'Alpha' })
  const target = page.locator('.terminal-pane').nth(0).locator('.pane-tabs')
  await source.dragTo(target)
  await expect(page.locator('.terminal-pane').nth(0).locator('.pane-tab')).toHaveCount(3)
  await expect(page.locator('.terminal-pane').nth(1).locator('.pane-tab')).toHaveCount(1)
  expect(fx.shells.length).toBe(shells)
  await page.screenshot({ path: '.private/split.png' })
  for (const label of ['三列', '双行', '三行', '网格 2×2', '右侧双行', '底部双列', '单一']) {
    await page.getByRole('button', { name: '终端布局' }).click()
    await page.getByText(label, { exact: true }).click()
  }
  await expect(page.locator('.terminal-pane')).toHaveCount(1)
  await expect(page.locator('.pane-tab')).toHaveCount(4)
  expect(fx.shells.length).toBe(shells)
  const active = await page.locator('.pane-tab.active').textContent()
  await press('Control+Tab')
  await expect(page.locator('.pane-tab.active')).not.toHaveText(active)
})
test('screen alternate buffer, terminal resizing and tmux prefixes work through actual PTYs', async () => {
  // These processes run only inside the disposable local fixture, never on LAN hosts.
  const tmux = process.env.QUAYTERM_TMUX || path.resolve('.private/tooling/usr/bin/tmux')
  const lib = path.resolve('.private/tooling/usr/lib/x86_64-linux-gnu')
  await input(
    `LD_LIBRARY_PATH='${lib}' '${tmux}' -S '${fx.root}/tmux.sock' -f '${fx.root}/tmux.conf' new-session -s quayterm-test\r`
  )
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('quayterm-test')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('0:bash')
  await press('Control+b')
  await press('c')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('1:bash')
  await input("printf 'TMUX_RENDER_OK\\n'\r")
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('TMUX_RENDER_OK')
  const previous = fx.sizes.length
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720))
  await expect.poll(() => fx.sizes.length).toBeGreaterThan(previous)
  await page.screenshot({ path: '.private/tmux.png' })
  await press('Control+b')
  await press('d')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('detached')
  await input('screen -c /dev/null -S quayterm-test /bin/bash --noprofile --norc\r')
  await page.waitForTimeout(600)
  await press('Space')
  await input("printf 'SCREEN_RENDER_OK\\n'\r")
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('SCREEN_RENDER_OK')
  await press('Control+a')
  await press('d')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('detached')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1420, 900))
})
test('terminal file tree edits text and dual SFTP panes can both switch endpoints', async () => {
  await expect(page.locator('.terminal-files .file-row').filter({ hasText: 'hello.txt' })).toBeVisible()
  await page.locator('.terminal-files .file-row').filter({ hasText: 'hello.txt' }).dblclick()
  await expect(page.getByRole('textbox', { name: '文件编辑器' })).toHaveValue(/QuayTerm fixture/)
  await page.getByRole('textbox', { name: '文件编辑器' }).fill('Saved through UI 你好\n')
  await page.getByRole('textbox', { name: '文件编辑器' }).press(`${commandModifier}+s`)
  await expect
    .poll(() => fs.readFileSync(path.join(fx.root, 'hello.txt'), 'utf8'))
    .toBe('Saved through UI 你好\n')
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: 'SFTP', exact: true }).click()
  await expect(page.locator('.sftp-screen .file-pane').first().locator('.endpoint-label')).toHaveText('本地')
  await page.getByRole('button', { name: '选择主机', exact: true }).click()
  await page.locator('.endpoint-host').filter({ hasText: 'Alpha' }).click()
  await expect(
    page.locator('.sftp-screen .file-pane').nth(1).locator('.file-row').filter({ hasText: 'hello.txt' })
  ).toBeVisible()
  await page.locator('.sftp-screen .file-pane').nth(1).locator('.endpoint-label').click()
  await page.getByRole('button', { name: '本地', exact: true }).last().click()
  await expect(page.locator('.sftp-screen .file-pane').nth(1).locator('.endpoint-label')).toHaveText('本地')
  await page.locator('.sftp-screen .file-pane').first().locator('.endpoint-label').click()
  await page.locator('.endpoint-host').filter({ hasText: 'Beta' }).click()
  await expect(
    page.locator('.sftp-screen .file-pane').first().locator('.file-row').filter({ hasText: 'hello.txt' })
  ).toBeVisible()
  await page.screenshot({ path: '.private/sftp.png' })
})
test('file drag upload, remote rename, download and confirmed deletion work in the desktop UI', async () => {
  const left = page.locator('.sftp-screen .file-pane').first()
  const right = page.locator('.sftp-screen .file-pane').nth(1)
  const transferDirectory = path.join(data, 'transfer-files')
  fs.mkdirSync(transferDirectory)
  fs.writeFileSync(path.join(transferDirectory, 'ui-upload.txt'), 'Desktop transfer 你好\n')
  await right.getByRole('textbox', { name: '文件路径', exact: true }).fill(transferDirectory)
  await right.getByRole('textbox', { name: '文件路径', exact: true }).press('Enter')
  const source = right.locator('.file-row').filter({ hasText: 'ui-upload.txt' })
  await expect(source).toBeVisible()
  await source.dragTo(left.locator('.file-path'))
  await page.getByRole('button', { name: '开始传输', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(fx.root, 'ui-upload.txt'))).toBeTruthy()
  await expect(left.locator('.file-row').filter({ hasText: 'ui-upload.txt' })).toBeVisible()
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await left.locator('.file-row').filter({ hasText: 'ui-upload.txt' }).click()
  await left.getByRole('button', { name: '文件操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  await page.getByRole('textbox', { name: '文件名称', exact: true }).fill('ui-download.txt')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.ant-modal-wrap:visible')).toHaveCount(0)
  const remote = left.locator('.file-row').filter({ hasText: 'ui-download.txt' })
  await expect(remote).toBeVisible()
  await remote.dragTo(right.locator('.file-path'))
  await page.getByRole('button', { name: '开始传输', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(transferDirectory, 'ui-download.txt'))).toBeTruthy()
  expect(fs.readFileSync(path.join(transferDirectory, 'ui-download.txt'), 'utf8')).toBe(
    'Desktop transfer 你好\n'
  )
  await remote.click()
  await left.getByRole('button', { name: '文件操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(fx.root, 'ui-download.txt'))).toBeFalsy()
  await page.getByRole('button', { name: '关闭传输队列' }).click()
})
test('large terminal output survives flow control and scrollback limits', async () => {
  await page.locator('.workspace-tab').click()
  await input(`python3 -c "[print('LINE-%05d'%i) for i in range(50000)];print('FLOW_DONE')"\r`)
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('LINE-49999', {
    timeout: 30000
  })
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('FLOW_DONE')
  await press(`${commandModifier}+Shift+W`)
  await page.getByRole('button', { name: '断开', exact: true }).click()
  await expect(page.locator('.pane-tab')).toHaveCount(3)
})
test('known-host fingerprints, application isolation, and no renderer errors', async () => {
  await hostPage()
  await page.getByRole('button', { name: '已知主机', exact: true }).click()
  await expect(page.locator('.known-grid .host-card')).toHaveCount(1)
  await page.locator('.known-grid .host-card').click()
  await expect(page.locator('.fingerprint-info')).toContainText('SHA256:')
  await page.getByRole('button', { name: '知道了' }).click()
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined')
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
  )
  expect(preferences.contextIsolation).toBe(true)
  expect(preferences.nodeIntegration).toBe(false)
  expect(preferences.sandbox).toBe(true)
  expect(errors).toEqual([])
})
