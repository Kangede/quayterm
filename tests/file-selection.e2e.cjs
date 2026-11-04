const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { nativeProbe } = require('./native-probe.cjs')
const {
  selectionFiles,
  exerciseTreeSelection,
  fileRow,
  selectedPaths,
  multi
} = require('./file-selection-checks.cjs')

test('native file selection spans expanded SFTP branches and follows flat-list sorting', async () => {
  const root = '/native'
  const probe = await nativeProbe({
    extraFiles: Object.fromEntries(
      Object.entries(selectionFiles).map(([p, value]) => [`${root}/${p}`, value])
    )
  })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-selection-'))
  const flat = path.join(directory, 'flat')
  fs.mkdirSync(flat)
  for (const [name, contents] of [
    ['a.txt', '1'],
    ['b.txt', '123'],
    ['c.txt', '12']
  ])
    fs.writeFileSync(path.join(flat, name), contents)
  let app, page
  const errors = []
  try {
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
    await page.evaluate(
      (port) =>
        window.quay.invoke('hostSave', {
          name: 'Selection fixture',
          address: '127.0.0.1',
          port,
          username: 'tester',
          password: 'native-fixture-not-a-secret',
          rememberPassword: false
        }),
      probe.port
    )
    await page.reload()
    await page.locator('.host-card').dblclick()
    await expect(page.locator('.verify-content')).toContainText(probe.fingerprint)
    await page.getByRole('button', { name: '信任并连接', exact: true }).click()
    const side = page.locator('.terminal-files')
    await expect(side.locator('.file-row[data-path$="/info.txt"]')).toBeVisible()
    await exerciseTreeSelection(page, app, side, root)
    await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
    await page.getByRole('button', { name: '切换文件侧栏', exact: true }).click()
    await fileRow(side, root, 'selection/b.txt').click({ modifiers: ['Shift'] })
    await expect
      .poll(() => selectedPaths(side))
      .toEqual([`${root}/selection/b.txt`, `${root}/selection/c.txt`])
    // Entering a different directory resets the former tree anchor.
    await fileRow(side, root, 'selection').dblclick()
    await expect(side.getByRole('textbox', { name: '侧栏文件路径', exact: true })).toHaveValue(
      `${root}/selection`
    )
    await fileRow(side, root, 'selection/c.txt').click({ modifiers: ['Shift'] })
    await expect.poll(() => selectedPaths(side)).toEqual([`${root}/selection/c.txt`])
    // The same FilePane component also serves ordinary local/SFTP lists.
    await page.getByRole('button', { name: 'SFTP', exact: true }).click()
    const pane = page.locator('.sftp-screen .file-pane').first()
    await pane.getByRole('textbox', { name: '文件路径', exact: true }).fill(flat)
    await pane.getByRole('textbox', { name: '文件路径', exact: true }).press('Enter')
    const row = (name) =>
      pane
        .locator('.file-row[data-path]')
        .filter({ has: page.locator(`.file-name > span[title=${JSON.stringify(name)}]`) })
    const paths = (names) => names.map((n) => path.join(fs.realpathSync.native(flat), n))
    await row('c.txt').click()
    await row('a.txt').click({ modifiers: ['Shift'] })
    await expect.poll(() => selectedPaths(pane)).toEqual(paths(['a.txt', 'b.txt', 'c.txt']))
    await row('b.txt').click({ modifiers: ['Shift'] })
    await expect.poll(() => selectedPaths(pane)).toEqual(paths(['b.txt', 'c.txt']))
    await pane.getByRole('button', { name: '大小', exact: true }).click()
    await row('b.txt').click()
    await row('a.txt').click({ modifiers: ['Shift'] })
    await expect.poll(() => selectedPaths(pane)).toEqual(paths(['b.txt', 'c.txt', 'a.txt']))
    await row('c.txt').click({ modifiers: [multi] })
    await expect.poll(() => selectedPaths(pane)).toEqual(paths(['b.txt', 'a.txt']))
    expect(errors).toEqual([])
    expect(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8')).not.toContain(
      'native-fixture-not-a-secret'
    )
  } catch (error) {
    await page?.screenshot({ path: test.info().outputPath('file-selection-failed.png') }).catch(() => {})
    throw error
  } finally {
    if (app) {
      await app
        .evaluate(({ app, clipboard }) => {
          clipboard.clear()
          app.exit()
        })
        .catch(() => {})
      await app.close().catch(() => {})
    }
    await probe.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
