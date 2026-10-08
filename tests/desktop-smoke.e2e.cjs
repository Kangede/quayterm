const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
test('native desktop host management, local files, credentials isolation and window startup', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-native-'))
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, QUAYTERM_DATA_DIR: directory }
  })
  try {
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await expect(page.getByRole('button', { name: '远程主机', exact: true })).toBeVisible()
    await page
      .locator('.host-toolbar')
      .getByRole('button', { name: /添加主机/ })
      .click()
    await page.getByRole('textbox', { name: '主机地址', exact: true }).fill('192.0.2.1')
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
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined')
    expect(errors).toEqual([])
  } finally {
    await app.evaluate(({ app }) => app.exit())
    await app.close().catch(() => {})
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
