const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { nativeProbe } = require('./native-probe.cjs')
let app, page, probe, directory, local, hosts, errors
const secret = 'usability-fixture-not-a-secret'
test.beforeEach(async () => {
  errors = []
  probe = await nativeProbe({
    extraFiles: {
      '/native/.hidden.txt': 'hidden',
      '/native/folder/.nested.txt': 'nested hidden'
    }
  })
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-usability-'))
  local = path.join(directory, 'files')
  fs.mkdirSync(local)
  fs.writeFileSync(path.join(local, '.local-hidden'), 'local hidden')
  const executable = process.env.QUAYTERM_TEST_EXECUTABLE
  app = await electron.launch({
    chromiumSandbox: Boolean(executable),
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: executable
      ? []
      : [path.resolve(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, QUAYTERM_DATA_DIR: directory }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  if (executable) {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
  }
  await page.getByRole('button', { name: '远程主机', exact: true }).waitFor()
  hosts = []
  for (const name of ['Alpha', 'Beta'])
    hosts.push(
      await page.evaluate((host) => window.quay.invoke('hostSave', host), {
        name,
        address: '127.0.0.1',
        port: probe.port,
        username: 'tester',
        password: name === 'Alpha' ? 'native-fixture-not-a-secret' : secret,
        rememberPassword: name === 'Beta'
      })
    )
  await page.reload()
  await expect(page.locator('.host-card')).toHaveCount(2)
})
test.afterEach(async ({}, info) => {
  if (page && info.status !== info.expectedStatus)
    await page.screenshot({ path: info.outputPath('usability-failed.png') }).catch(() => {})
  if (app) {
    await app.evaluate(({ app }) => app.exit()).catch(() => {})
    await app.close().catch(() => {})
  }
  await probe?.close()
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  expect(errors).toEqual([])
})
async function connect() {
  await page.locator('.host-card').filter({ hasText: 'Alpha' }).dblclick()
  await expect(page.locator('.verify-content')).toContainText(probe.fingerprint)
  await page.getByRole('button', { name: '信任并连接', exact: true }).click()
  await expect(page.locator('.terminal-pane.focused .xterm-rows')).toContainText('Native SSH ready')
}
async function edit(name) {
  await page.locator('.host-card').filter({ hasText: name }).hover()
  await page.getByRole('button', { name: `编辑 ${name}`, exact: true }).click()
}
async function localPane() {
  await page.getByRole('button', { name: 'SFTP', exact: true }).click()
  const pane = page.locator('.sftp-screen .file-pane').first()
  const field = pane.getByRole('textbox', { name: '文件路径', exact: true })
  await field.fill(local)
  await field.press('Enter')
  await expect(field).toHaveValue(fs.realpathSync.native(local))
  return pane
}
async function fileAction(pane, name) {
  await pane.getByRole('button', { name: '文件操作', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文件名称', exact: true })).toBeVisible()
}

test('hidden files are visible by default in the terminal tree and both file panes', async () => {
  await connect()
  const side = page.locator('.terminal-files')
  await expect(side.locator('.file-row[data-path="/native/.hidden.txt"]')).toBeVisible()
  await side.getByRole('button', { name: '展开 folder', exact: true }).click()
  await expect(side.locator('.file-row[data-path="/native/folder/.nested.txt"]')).toBeVisible()
  await side.getByRole('button', { name: '显示隐藏文件', exact: true }).click()
  await expect(side.locator('.file-row[data-path="/native/.hidden.txt"]')).toHaveCount(0)
  await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
  await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
  await expect(side.locator('.file-row[data-path="/native/.hidden.txt"]')).toHaveCount(0)
  const local = await localPane()
  await expect(local.locator('.file-row').filter({ hasText: '.local-hidden' })).toBeVisible()
  await page.getByRole('button', { name: '选择主机', exact: true }).click()
  await page.locator('.endpoint-host').filter({ hasText: 'Alpha' }).click()
  const remote = page.locator('.sftp-screen .file-pane').nth(1)
  await expect(remote.locator('.file-row[data-path="/native/.hidden.txt"]')).toBeVisible()
})

test('Enter confirms file and folder creation without submitting empty or composing names', async () => {
  const pane = await localPane()
  for (const [action, name, folder] of [
    ['新建文件', '新建文件.txt', false],
    ['新建文件夹', '新建 文件夹', true]
  ]) {
    await fileAction(pane, action)
    const field = page.getByRole('textbox', { name: '文件名称', exact: true })
    await field.press('Enter')
    await expect(field).toBeVisible()
    await field.fill(name)
    await field.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true })
    expect(fs.existsSync(path.join(local, name))).toBe(false)
    await expect(field).toBeVisible()
    await field.press('Enter')
    await expect(field).toHaveCount(0)
    await expect.poll(() => fs.existsSync(path.join(local, name))).toBe(true)
    expect(fs.statSync(path.join(local, name)).isDirectory()).toBe(folder)
  }
  await fileAction(pane, '新建文件')
  const field = page.getByRole('textbox', { name: '文件名称', exact: true })
  await field.fill('新建文件.txt')
  await field.press('Enter')
  await expect(field).toBeVisible()
  await expect(page.locator('.ant-message')).toContainText(/存在/)
  await field.fill('第二个文件.txt')
  await field.press('Enter')
  await expect(field).toHaveCount(0)
  expect(fs.readFileSync(path.join(local, '新建文件.txt'), 'utf8')).toBe('')
  expect(fs.existsSync(path.join(local, '第二个文件.txt'))).toBe(true)
})

test('saved host passwords are populated masked and can be revealed, edited and cleared', async () => {
  await app.evaluate(({ app }) => {
    const { Store } = process
      .getBuiltinModule('node:module')
      .createRequire(app.getAppPath() + '/package.json')('./electron/store.cjs')
    const read = Store.prototype.credentials,
      save = Store.prototype.upsert
    global.__passwordWrites = []
    global.__readSavedCipher = false
    Store.prototype.credentials = function (id) {
      // When native secure storage is available, exercise reading the cipher
      // as after a restart, rather than the just-saved in-memory credential.
      if (this.get(id).secret) {
        this.passwords.delete(id)
        global.__readSavedCipher = true
      }
      return read.call(this, id)
    }
    Store.prototype.upsert = function (input) {
      global.__passwordWrites.push(typeof input.password === 'string')
      return save.call(this, input)
    }
  })
  await edit('Beta')
  const password = page.getByLabel('SSH 密码', { exact: true })
  await expect(password).toHaveValue(secret)
  await expect(password).toHaveAttribute('type', 'password')
  await page.locator('.host-editor .ant-input-password-icon').click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue(secret)
  await page.getByRole('textbox', { name: '主机备注', exact: true }).fill('metadata only')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.host-editor')).toHaveCount(0)
  expect(await app.evaluate(() => global.__passwordWrites)).toEqual([false])
  const secure = await page.evaluate(async () => (await window.quay.invoke('bootstrap')).secureStorage)
  if (secure) expect(await app.evaluate(() => global.__readSavedCipher)).toBe(true)
  await edit('Beta')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue(secret)
  const replacement = 'replacement-fixture-not-a-secret'
  await password.fill(replacement)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.host-editor')).toHaveCount(0)
  expect(await app.evaluate(() => global.__passwordWrites)).toEqual([false, true])
  await edit('Beta')
  await expect(password).toHaveValue(replacement)
  await password.fill('')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.host-editor')).toHaveCount(0)
  expect(
    await page.evaluate(
      async (id) => (await window.quay.invoke('bootstrap')).hosts.find((h) => h.id === id).hasPassword,
      hosts[1].id
    )
  ).toBe(false)
  const disk = fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')
  expect(disk).not.toContain(secret)
  expect(disk).not.toContain(replacement)
  expect(
    await page.evaluate(async () =>
      (await window.quay.invoke('bootstrap')).hosts.every((h) => !('password' in h) && !('secret' in h))
    )
  ).toBe(true)
})

test('hovering the pane add button never creates outer scrollbars or clips its tooltip', async () => {
  await connect()
  for (const [width, height] of [
    [1100, 720],
    [850, 550]
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height]
    )
    for (const layout of ['单一', '双列', '网格 2×2']) {
      await page.getByRole('button', { name: '终端布局', exact: true }).click()
      await page.getByText(layout, { exact: true }).click()
      await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
      await page.evaluate(() => {
        window.__viewportSamples = []
        window.__sampleViewport = true
        function sample() {
          const root = document.documentElement
          window.__viewportSamples.push({
            width: innerWidth,
            height: innerHeight,
            clientWidth: root.clientWidth,
            clientHeight: root.clientHeight,
            scrollWidth: root.scrollWidth,
            scrollHeight: root.scrollHeight
          })
          if (window.__sampleViewport) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      await page.getByRole('button', { name: '面板添加会话', exact: true }).last().hover()
      const tip = page.getByRole('tooltip', { name: '在此面板添加会话', exact: true })
      await expect(tip).toBeVisible()
      await expect(tip).toHaveCSS('opacity', '1')
      const rect = await tip.boundingBox()
      const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(rect.x).toBeGreaterThanOrEqual(-1)
      expect(rect.y).toBeGreaterThanOrEqual(-1)
      expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1)
      expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1)
      if (width === 850 && layout === '网格 2×2')
        await page.screenshot({ path: test.info().outputPath('tooltip-contained.png') })
      await page.mouse.move(60, 80)
      await expect(tip).toHaveCount(0)
      const overflow = await page.evaluate(() => {
        window.__sampleViewport = false
        return window.__viewportSamples.filter(
          (s) =>
            s.clientWidth < s.width ||
            s.clientHeight < s.height ||
            s.scrollWidth > s.width + 1 ||
            s.scrollHeight > s.height + 1
        )
      })
      expect(overflow).toEqual([])
    }
  }
})

test('late or failed password reads do not affect another editor or clear existing credentials', async () => {
  await app.evaluate(({ app }, id) => {
    const { Store } = process
      .getBuiltinModule('node:module')
      .createRequire(app.getAppPath() + '/package.json')('./electron/store.cjs')
    global.__credentialOriginal = Store.prototype.credentials
    global.__holdCredential = id
    Store.prototype.credentials = function (id) {
      if (id === global.__holdCredential)
        return new Promise((resolve) => {
          global.__releaseCredential = () => {
            global.__holdCredential = null
            resolve(global.__credentialOriginal.call(this, id))
          }
        })
      return global.__credentialOriginal.call(this, id)
    }
  }, hosts[0].id)
  await edit('Alpha')
  await expect(page.getByLabel('SSH 密码', { exact: true })).toBeDisabled()
  await edit('Beta')
  const password = page.getByLabel('SSH 密码', { exact: true })
  await expect(password).toHaveValue(secret)
  await page.locator('.host-editor .ant-input-password-icon').click()
  await expect(password).toHaveAttribute('type', 'text')
  await app.evaluate(() => global.__releaseCredential())
  await expect(password).toHaveValue(secret)
  await expect(page.getByRole('textbox', { name: '主机名称', exact: true })).toHaveValue('Beta')
  await page.getByRole('button', { name: '关闭主机编辑', exact: true }).click()
  await app.evaluate(({ app }) => {
    const { Store } = process
      .getBuiltinModule('node:module')
      .createRequire(app.getAppPath() + '/package.json')('./electron/store.cjs')
    Store.prototype.credentials = () => {
      throw new Error('无法解密已保存的密码，请重新输入')
    }
  })
  await edit('Alpha')
  await expect(password).toBeEnabled()
  await expect(page.locator('.host-editor')).toContainText('未修改密码直接保存，会保留原密码')
  await page.getByRole('textbox', { name: '主机备注', exact: true }).fill('keep the old credential')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.host-editor')).toHaveCount(0)
  await app.evaluate(({ app }) => {
    const { Store } = process
      .getBuiltinModule('node:module')
      .createRequire(app.getAppPath() + '/package.json')('./electron/store.cjs')
    Store.prototype.credentials = global.__credentialOriginal
  })
  await edit('Alpha')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('native-fixture-not-a-secret')
  await expect(page.getByRole('textbox', { name: '主机备注', exact: true })).toHaveValue(
    'keep the old credential'
  )
})

test('an explicit hidden-file preference is honored while new defaults remain enabled', async () => {
  await page.evaluate(() => window.quay.invoke('settings', { showHidden: false }))
  await page.reload()
  await connect()
  const side = page.locator('.terminal-files')
  await expect(side.locator('.file-row[data-path="/native/info.txt"]')).toBeVisible()
  await expect(side.locator('.file-row[data-path="/native/.hidden.txt"]')).toHaveCount(0)
  const pane = await localPane()
  await expect(pane.locator('.file-row').filter({ hasText: '.local-hidden' })).toHaveCount(0)
  await pane.getByRole('button', { name: '显示隐藏文件', exact: true }).click()
  await expect(pane.locator('.file-row').filter({ hasText: '.local-hidden' })).toBeVisible()
})
