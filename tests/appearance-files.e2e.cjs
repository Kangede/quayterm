const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { fixture } = require('./fixture.cjs')
const themes = require('../shared/terminal-themes.json')
let app, page, fx, directory, local, download
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  fx = await fixture()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-features-'))
  local = path.join(directory, 'local')
  download = path.join(directory, 'download')
  fs.mkdirSync(local)
  fs.mkdirSync(download)
  fs.mkdirSync(path.join(local, 'folder'))
  fs.writeFileSync(path.join(local, 'first.txt'), 'first file\n')
  fs.writeFileSync(path.join(local, 'second.txt'), 'second file\n')
  fs.writeFileSync(path.join(local, 'upload.txt'), 'upload through context menu\n')
  const seed = path.join(directory, 'seed.json')
  fs.writeFileSync(seed, JSON.stringify([{ ...fx.host, name: '功能测试主机' }]))
  app = await electron.launch({
    ...(process.env.QUAYTERM_TEST_EXECUTABLE
      ? { executablePath: path.resolve(process.env.QUAYTERM_TEST_EXECUTABLE) }
      : {}),
    args: process.env.QUAYTERM_TEST_EXECUTABLE ? [] : [path.resolve(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, QUAYTERM_DATA_DIR: directory, QUAYTERM_TEST_SEED: seed }
  })
  page = await app.firstWindow()
  if (process.env.QUAYTERM_TEST_EXECUTABLE) {
    await page.getByRole('button', { name: '远程主机', exact: true }).waitFor()
    await page.evaluate(
      (host) => window.quay.invoke('hostSave', { ...host, name: '功能测试主机', rememberPassword: false }),
      fx.host
    )
    await page.reload()
  }
  await expect(page.locator('.host-card')).toHaveCount(1)
})
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page) {
    await page.screenshot({ path: '.private/features-failed.png' }).catch(() => {})
    console.log(
      (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(-4000)
    )
  }
})
test.afterAll(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit())
    await app.close().catch(() => {})
  }
  await fx?.close()
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
})
const panel = (side) => page.locator('.sftp-screen .file-pane').nth(side)
const row = (pane, name) =>
  pane
    .locator('.file-row[data-path]')
    .filter({ has: page.locator('.file-name > span[title]', { hasText: name }) })
async function contextItem(label) {
  const menu = page.locator('.ant-dropdown:visible').last()
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: new RegExp(label) }).click()
  await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
}
async function popupPainted() {
  const popup = page.locator('.ant-dropdown:visible').last()
  await expect(popup).toHaveCSS('opacity', '1')
  await expect(popup).not.toHaveClass(/ant-slide-(?:up|down)-(?:enter|appear)/)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
}
async function blankMenu(pane) {
  await pane.locator('.file-rows').click({ button: 'right', position: { x: 100, y: 320 } })
}
async function location(pane, p) {
  await pane.getByRole('textbox', { name: '文件路径', exact: true }).fill(p)
  await pane.getByRole('textbox', { name: '文件路径', exact: true }).press('Enter')
}
async function startTransfer() {
  await page.getByRole('button', { name: '开始传输', exact: true }).click()
}
async function theme(name) {
  await page.getByRole('button', { name: '终端风格', exact: true }).click()
  await contextItem(name)
}
async function foreground(line, token) {
  return page
    .locator('.terminal-pane.focused .xterm-rows > div')
    .filter({ hasText: line })
    .first()
    .evaluate((row, text) => {
      const start = row.textContent.indexOf(text)
      if (start < 0) return ''
      const colors = new Set()
      let offset = 0
      for (const cell of row.children) {
        const end = offset + cell.textContent.length
        if (end > start && offset < start + text.length) colors.add(getComputedStyle(cell).color)
        offset = end
      }
      return colors.size === 1 ? [...colors][0] : JSON.stringify([...colors])
    }, token)
}

test('local file context menus target the clicked item, preserve multiple selection and paste into folders', async () => {
  await page.getByRole('button', { name: 'SFTP', exact: true }).click()
  const left = panel(0)
  await location(left, local)
  await row(left, 'first.txt').click()
  await row(left, 'second.txt').click({ modifiers: ['Control'] })
  await row(left, 'first.txt').click({ button: 'right' })
  await expect(left.locator('.file-row.selected')).toHaveCount(2)
  await contextItem('复制路径')
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    [path.join(local, 'first.txt'), path.join(local, 'second.txt')].join('\n')
  )
  await row(left, 'folder').click({ button: 'right' })
  await expect(left.locator('.file-row.selected')).toHaveCount(1)
  await contextItem('新建文件$')
  await page.getByRole('textbox', { name: '文件名称', exact: true }).fill('inside.txt')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(local, 'folder', 'inside.txt'))).toBeTruthy()
  expect(fs.existsSync(path.join(local, 'inside.txt'))).toBeFalsy()
  await row(left, 'first.txt').focus()
  await page.keyboard.press('Shift+F10')
  await contextItem('复制文件')
  await row(left, 'folder').click({ button: 'right' })
  await contextItem('粘贴文件')
  await startTransfer()
  await expect.poll(() => fs.existsSync(path.join(local, 'folder', 'first.txt'))).toBeTruthy()
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await row(left, 'second.txt').click({ button: 'right' })
  await contextItem('属性')
  await expect(page.locator('.file-properties')).toContainText(path.join(local, 'second.txt'))
  await page.getByRole('button', { name: '知道了', exact: true }).click()
  await row(left, 'second.txt').click({ button: 'right' })
  await contextItem('重命名')
  await page.getByRole('textbox', { name: '文件名称', exact: true }).fill('renamed.txt')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(row(left, 'renamed.txt')).toBeVisible()
  await row(left, 'renamed.txt').click({ button: 'right' })
  await contextItem('删除$')
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(local, 'renamed.txt'))).toBeFalsy()
  await blankMenu(left)
  await contextItem('新建文件夹')
  await page.getByRole('textbox', { name: '文件名称', exact: true }).fill('from-blank')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => fs.existsSync(path.join(local, 'from-blank'))).toBeTruthy()
})
test('SFTP context menus download, upload files/folders and transfer to the other pane', async () => {
  await page.getByRole('button', { name: '选择主机', exact: true }).click()
  await page.locator('.endpoint-host').click()
  await page.getByRole('button', { name: '信任并连接', exact: true }).click()
  const right = panel(1)
  await expect(row(right, 'hello.txt')).toBeVisible()
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: false,
        filePaths: [
          options.title === '选择下载位置'
            ? paths.download
            : options.title === '选择上传的文件夹'
              ? paths.folder
              : paths.file
        ]
      })
    },
    { download, folder: path.join(local, 'folder'), file: path.join(local, 'upload.txt') }
  )
  await row(right, 'hello.txt').click({ button: 'right' })
  await contextItem('下载到本地')
  await startTransfer()
  await expect.poll(() => fs.existsSync(path.join(download, 'hello.txt'))).toBeTruthy()
  expect(fs.readFileSync(path.join(download, 'hello.txt'), 'utf8')).toContain('QuayTerm fixture')
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await blankMenu(right)
  await contextItem('上传文件…')
  await startTransfer()
  await expect.poll(() => fs.existsSync(path.join(fx.root, 'upload.txt'))).toBeTruthy()
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await row(right, 'documents').click({ button: 'right' })
  await contextItem('上传文件夹')
  await startTransfer()
  await expect.poll(() => fs.existsSync(path.join(fx.root, 'documents', 'folder', 'first.txt'))).toBeTruthy()
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await row(right, 'upload.txt').click({ button: 'right' })
  await contextItem('重命名')
  await page.getByRole('textbox', { name: '文件名称', exact: true }).fill('remote-only.txt')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await row(right, 'remote-only.txt').click({ button: 'right' })
  await contextItem('传输到另一侧')
  await startTransfer()
  await expect.poll(() => fs.existsSync(path.join(local, 'remote-only.txt'))).toBeTruthy()
  expect(fs.readFileSync(path.join(local, 'remote-only.txt'), 'utf8')).toBe('upload through context menu\n')
  await page.getByRole('button', { name: '关闭传输队列' }).click()
  await row(right, 'hello.txt').click({ button: 'right' })
  await expect(
    page
      .locator('.ant-dropdown:visible')
      .last()
      .getByRole('menuitem', { name: /复制文件/ })
  ).toBeVisible()
  await popupPainted()
  await page.screenshot({ path: '.private/context-menu.png' })
  await page.keyboard.press('Escape')
})
test('terminal sidebar right-click editing and six live themes work without reconnecting', async () => {
  await page.getByRole('button', { name: '主机', exact: true }).click()
  await page.locator('.host-card').dblclick()
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('quay-test$')
  const files = page.locator('.terminal-files')
  await row(files, 'hello.txt').click({ button: 'right' })
  await contextItem('编辑文件')
  await expect(page.getByRole('textbox', { name: '文件编辑器' })).toHaveValue(/QuayTerm fixture/)
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  const shells = fx.shells.length
  for (const [id, preset] of Object.entries(themes)) {
    await theme(preset.name)
    await expect(page.locator('.workspace')).toHaveAttribute('data-terminal-theme', id)
    await expect
      .poll(() =>
        page.locator('.terminal-pane.focused .xterm-rows').evaluate((e) => getComputedStyle(e).color)
      )
      .toBe(rgb(preset.foreground))
    expect(fx.shells.length).toBe(shells)
  }
  await theme(themes.paper.name)
  expect(
    JSON.parse(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')).settings.terminalTheme
  ).toBe('paper')
  await page.getByRole('button', { name: '新建连接', exact: true }).click()
  await page.locator('.recent-hosts button').filter({ hasText: '功能测试主机' }).click()
  await expect(page.locator('.pane-tab')).toHaveCount(2)
  await expect(page.locator('.terminal-pane.focused .connection-overlay')).toHaveCount(0)
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('quay-test$')
  await expect
    .poll(() => page.locator('.terminal-pane.focused .xterm-rows').evaluate((e) => getComputedStyle(e).color))
    .toBe(rgb(themes.paper.foreground))
  await expect(row(page.locator('.terminal-files'), 'hello.txt')).toBeVisible()
  await page.getByRole('button', { name: '终端风格', exact: true }).click()
  await expect(
    page
      .locator('.ant-dropdown:visible')
      .last()
      .getByRole('menuitem', { name: /纸白浅色/ })
  ).toBeVisible()
  await popupPainted()
  await page.screenshot({ path: '.private/paper-theme.png' })
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
  await theme(themes['quay-dark'].name)
})
test('automatic highlights preserve ANSI colors, progress redraw and alternate screens over SSH', async () => {
  fx.output(
    '\x1b[0m\x1b[2J\x1b[Hplain ERROR marker\r\nplain WARN marker\r\nplain SUCCESS marker\r\n\x1b[38;2;12;200;140mERROR EXPLICIT\x1b[0m\r\n\x1b[38;5;208mINDEXED\x1b[0m\r\n中文 10.2.3.4 https://example.test\r\n'
  )
  await expect.poll(() => foreground('plain ERROR marker', 'ERROR')).toBe(rgb(themes['quay-dark'].palette[1]))
  await expect.poll(() => foreground('plain WARN marker', 'WARN')).toBe(rgb(themes['quay-dark'].palette[3]))
  await expect
    .poll(() => foreground('plain SUCCESS marker', 'SUCCESS'))
    .toBe(rgb(themes['quay-dark'].palette[2]))
  expect(await foreground('ERROR EXPLICIT', 'ERROR')).toBe('rgb(12, 200, 140)')
  expect(await foreground('INDEXED', 'INDEXED')).toBe('rgb(255, 135, 0)')
  await page.screenshot({ path: '.private/output-highlights.png' })
  await page.getByRole('button', { name: '终端风格', exact: true }).click()
  await contextItem('自动高亮输出')
  await expect.poll(() => foreground('plain ERROR marker', 'ERROR')).toBe(rgb(themes['quay-dark'].foreground))
  expect(await foreground('ERROR EXPLICIT', 'ERROR')).toBe('rgb(12, 200, 140)')
  expect(
    JSON.parse(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')).settings.outputHighlights
  ).toBe(false)
  await page.getByRole('button', { name: '终端风格', exact: true }).click()
  await contextItem('自动高亮输出')
  fx.output('\x1b[0m\x1b[2J\x1b[HERROR previous long output')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('ERROR previous')
  for (const percent of [10, 25, 50, 100]) {
    fx.output(`\r\x1b[2KProgress ${percent}%`)
    await expect(
      page.locator('.terminal-pane.focused .xterm-rows > div').filter({ hasText: `Progress ${percent}%` })
    ).toHaveCount(1)
  }
  await expect(
    page.locator('.terminal-pane.focused .xterm-rows > div').filter({ hasText: 'Progress' })
  ).toHaveCount(1)
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).not.toContainText('previous long')
  fx.output('\r\nnext line\r\n')
  await expect(
    page.locator('.terminal-pane.focused .xterm-rows > div').filter({ hasText: 'next line' })
  ).toHaveCount(1)
  fx.output('\x1b[?1049h\x1b[0m\x1b[2J\x1b[HERROR alternate screen')
  await expect
    .poll(() => foreground('ERROR alternate screen', 'ERROR'))
    .toBe(rgb(themes['quay-dark'].foreground))
  fx.output('\x1b[?1049l')
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('Progress 100%')
  fx.output('ERROR normal again\r\n')
  await expect.poll(() => foreground('ERROR normal again', 'ERROR')).toBe(rgb(themes['quay-dark'].palette[1]))
})
