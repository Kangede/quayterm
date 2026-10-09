const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { nativeProbe } = require('./native-probe.cjs')
test('native desktop SSH, SFTP, shortcuts, credentials isolation and window startup', async () => {
  const probe = await nativeProbe()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-native-'))
  const textFile = path.join(directory, 'BOM CRLF 中文.txt')
  const binaryFile = path.join(directory, 'native-binary.png')
  fs.writeFileSync(textFile, '\ufeffline1\r\nline2\r\n')
  fs.writeFileSync(binaryFile, Buffer.from([0, 255, 42]))
  const executable = process.env.QUAYTERM_TEST_EXECUTABLE
  const app = await electron.launch({
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: executable
      ? []
      : [path.resolve(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, QUAYTERM_DATA_DIR: directory }
  })
  try {
    if (executable) expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    const page = await app.firstWindow()
    // Exercise the native opening IPC without starting arbitrary third-party
    // applications on CI. The SFTP download and local files remain real.
    await app.evaluate(({ shell }) => {
      global.__nativeOpened = []
      shell.openPath = async (p) => {
        global.__nativeOpened.push(p)
        return ''
      }
    })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await expect(page.getByRole('button', { name: '远程主机', exact: true })).toBeVisible()
    await page
      .locator('.host-toolbar')
      .getByRole('button', { name: /添加主机/ })
      .click()
    await page.getByRole('textbox', { name: '主机地址', exact: true }).fill('127.0.0.1')
    await page.getByRole('spinbutton', { name: 'SSH 端口', exact: true }).fill(String(probe.port))
    await page.getByRole('textbox', { name: '主机名称', exact: true }).fill('Native desktop')
    await page.getByRole('textbox', { name: 'SSH 用户名' }).fill('tester')
    await page.getByLabel('SSH 密码', { exact: true }).fill('native-fixture-not-a-secret')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.host-card')).toContainText('Native desktop')
    const disk = fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')
    expect(disk).not.toContain('native-fixture-not-a-secret')
    await page.getByRole('button', { name: 'SFTP', exact: true }).click()
    await expect(page.locator('.sftp-screen .file-rows')).toBeVisible()
    const location = page
      .locator('.sftp-screen')
      .getByRole('textbox', { name: '文件路径', exact: true })
      .first()
    await location.fill(directory)
    await location.press('Enter')
    await expect(page.locator('.sftp-screen .file-row').filter({ hasText: 'quayterm.json' })).toBeVisible()
    await page.locator('.sftp-screen .file-row').filter({ hasText: 'BOM CRLF 中文.txt' }).dblclick()
    const fileEditor = page.getByRole('textbox', { name: '文件编辑器' })
    await expect(fileEditor).toHaveValue('\ufeffline1\nline2\n')
    for (const marker of ['first edit', 'second edit']) {
      await fileEditor.fill(`中文 ${marker}\nline2\n`)
      await fileEditor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
      await expect.poll(() => fs.readFileSync(textFile, 'utf8')).toBe(`\ufeff中文 ${marker}\r\nline2\r\n`)
    }
    await page.getByRole('button', { name: '关闭', exact: true }).last().click()
    const binaryRow = page.locator('.sftp-screen .file-row').filter({ hasText: 'native-binary.png' })
    await binaryRow.dblclick()
    await expect.poll(() => app.evaluate(() => global.__nativeOpened.length)).toBe(1)
    expect(await app.evaluate(() => global.__nativeOpened[0])).toBe(fs.realpathSync.native(binaryFile))
    await expect(page.locator('.file-editor-modal')).toHaveCount(0)
    await binaryRow.click({ button: 'right' })
    await page.getByRole('menuitem', { name: /用本地程序打开/ }).click()
    await expect.poll(() => app.evaluate(() => global.__nativeOpened.length)).toBe(2)
    await page.getByRole('button', { name: '主机', exact: true }).click()
    await page.locator('.host-card').dblclick()
    await expect(page.locator('.verify-content')).toContainText(probe.fingerprint)
    await page.getByRole('button', { name: '信任并连接', exact: true }).click()
    await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('Native SSH ready 测试')
    await expect(page.locator('.terminal-files .file-row').filter({ hasText: 'info.txt' })).toBeVisible()
    await page.locator('.terminal-files .file-row').filter({ hasText: 'info.txt' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /用本地程序打开/ }).click()
    await expect.poll(() => app.evaluate(() => global.__nativeOpened.length)).toBe(3)
    const snapshot = await app.evaluate(() => global.__nativeOpened[2])
    expect(path.basename(snapshot)).toBe('info.txt')
    expect(fs.readFileSync(snapshot, 'utf8')).toBe(probe.text)
    const firstLine = page.locator('.terminal-pane.focused .xterm-screen')
    const selectWord = async () => {
      await firstLine.click({ position: { x: 3, y: 7 } })
      await firstLine.dblclick({ position: { x: 3, y: 7 } })
    }
    const toggleAutoCopy = async () => {
      await page.getByRole('button', { name: '终端操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '选中文本后自动复制', exact: true }).click()
      await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
    }
    await app.evaluate(({ clipboard }) => clipboard.writeText('disabled-sentinel'))
    await selectWord()
    await page.waitForTimeout(120)
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('disabled-sentinel')
    await toggleAutoCopy()
    await selectWord()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Native')
    expect(
      JSON.parse(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')).settings.copyOnSelect
    ).toBe(true)
    await firstLine.click({ position: { x: 3, y: 7 } })
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Native')
    await toggleAutoCopy()
    await app.evaluate(({ clipboard }) => clipboard.writeText('off-again'))
    await selectWord()
    await page.waitForTimeout(120)
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('off-again')
    await page.getByRole('button', { name: '终端操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '复制选中文本', exact: true }).click()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Native')
    expect(
      JSON.parse(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')).settings.copyOnSelect
    ).toBe(false)
    const terminal = page.locator('.terminal-pane.focused .xterm-helper-textarea')
    await terminal.focus()
    await app.evaluate(({ clipboard }) => clipboard.writeText('NATIVE_PASTE'))
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+Shift+v')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+b')
    await expect.poll(() => Buffer.concat(probe.input).toString()).toContain('\x1b[200~NATIVE_PASTE\x1b[201~')
    await expect
      .poll(() => Buffer.concat(probe.input).includes(1) && Buffer.concat(probe.input).includes(2))
      .toBeTruthy()
    const sizeCount = probe.dimensions.length
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720))
    await expect.poll(() => probe.dimensions.length).toBeGreaterThan(sizeCount)
    await page.locator('.terminal-files .file-row').filter({ hasText: 'info.txt' }).dblclick()
    await expect(page.getByRole('textbox', { name: '文件编辑器' })).toHaveValue(probe.text)
    if (process.platform === 'darwin') {
      const roles = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu().items.map((item) => String(item.role || '').toLowerCase())
      )
      expect(roles).toContain('editmenu')
      const editor = page.getByRole('textbox', { name: '文件编辑器' })
      await editor.focus()
      await app.evaluate(({ clipboard }) => clipboard.writeText('Native menu paste'))
      await page.keyboard.press('Meta+a')
      await page.keyboard.press('Meta+v')
      await expect(editor).toHaveValue('Native menu paste')
      await editor.fill(probe.text)
    }
    await page.getByRole('button', { name: '关闭', exact: true }).last().click()
    await expect(page.locator('.file-editor-modal')).toHaveCount(0)
    // Exercise local selection while a remote application owns mouse reporting.
    probe.output('\x1b[?1049h')
    const box = await page.locator('.terminal-pane.focused .xterm-screen').boundingBox()
    for (const mode of [1000, 1002, 1003]) {
      for (const modifier of process.platform === 'darwin' ? ['Shift', 'Alt'] : ['Shift']) {
        await test.step(`mouse ${mode}: ${modifier} selects locally; ordinary click reaches SSH`, async () => {
          const marker = `${modifier[0]}${mode}_OK`
          // Position the pointer before enabling any-motion reporting (1003),
          // so this assertion measures the drag rather than preceding hover.
          probe.output(`\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[2J\x1b[HREADY_${marker}\r\n`)
          await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText(`READY_${marker}`)
          await page.mouse.move(box.x + 2, box.y + 7)
          probe.output(`\x1b[?${mode}h\x1b[?1006h\x1b[2J\x1b[H${marker}\r\n`)
          await expect(page.locator('.terminal-pane.focused .xterm-rows')).not.toContainText('READY_')
          await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText(marker)
          await app.evaluate(({ clipboard }) => clipboard.writeText('before-mouse-selection'))
          const mouseOffset = probe.input.length
          await page.keyboard.down(modifier)
          await page.mouse.down()
          await page.mouse.move(box.x + 125, box.y + 7, { steps: 12 })
          await page.mouse.up()
          await page.keyboard.up(modifier)
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+Shift+c')
          await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain(marker)
          expect(Buffer.concat(probe.input.slice(mouseOffset)).toString()).not.toMatch(/\x1b\[(?:M|<)/)
          const ordinaryMouseOffset = probe.input.length
          await page.locator('.terminal-pane.focused .xterm-screen').click({ position: { x: 3, y: 7 } })
          await expect
            .poll(() => Buffer.concat(probe.input.slice(ordinaryMouseOffset)).toString())
            .toMatch(/\x1b\[<0;/)
        })
      }
    }
    probe.output('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l')
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined')
    expect(errors).toEqual([])
  } finally {
    const opened = await app.evaluate(() => global.__nativeOpened || []).catch(() => [])
    await app.evaluate(({ app }) => app.exit())
    await app.close().catch(() => {})
    await probe.close()
    fs.rmSync(directory, { recursive: true, force: true })
    for (const p of opened)
      if (path.basename(path.dirname(p)).startsWith('quayterm-open-'))
        fs.rmSync(path.dirname(p), { recursive: true, force: true })
  }
})
