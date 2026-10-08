// Validate a packaged desktop build against explicitly supplied hosts.
// Creates disposable app data and performs only SSH login and SFTP listing.
const { _electron } = require('playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const executable = process.env.QUAYTERM_EXECUTABLE
  const input = process.env.QUAYTERM_TEST_HOSTS
  const fingerprints = process.env.QUAYTERM_EXPECTED_FINGERPRINTS
  if (!executable || !input || !fingerprints)
    throw new Error('Set QUAYTERM_EXECUTABLE, QUAYTERM_TEST_HOSTS and QUAYTERM_EXPECTED_FINGERPRINTS')
  const hosts = JSON.parse(fs.readFileSync(input, 'utf8'))
  const expected = JSON.parse(fs.readFileSync(fingerprints, 'utf8')).results
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-packaged-check-'))
  const report = { time: new Date().toISOString(), platform: process.platform, results: [] }
  let application
  try {
    application = await _electron.launch({
      executablePath: path.resolve(executable),
      args: [],
      env: { ...process.env, QUAYTERM_DATA_DIR: directory },
      timeout: 30000
    })
    const page = await application.firstWindow()
    await page.getByRole('button', { name: '远程主机', exact: true }).waitFor()
    report.version = await application.evaluate(({ app }) => app.getVersion())
    await page.evaluate(async (hosts) => {
      for (const host of hosts) await window.quay.invoke('hostSave', { ...host, rememberPassword: false })
    }, hosts)
    await page.reload()
    for (const host of hosts) {
      const fingerprint = expected.find(
        (entry) => entry.address === host.address && entry.port === host.port
      )?.fingerprint
      if (!fingerprint) throw new Error('Missing verified fingerprint for requested test host')
      await page.getByRole('button', { name: '主机', exact: true }).click()
      await page.locator('.host-card').filter({ hasText: host.name }).dblclick()
      const verification = page.locator('.verify-content')
      await verification.waitFor({ timeout: 20000 })
      if (!(await verification.innerText()).includes(fingerprint))
        throw new Error('Host fingerprint changed; packaged test stopped')
      await page.getByRole('button', { name: '信任并连接', exact: true }).click()
      await page
        .locator('.terminal-pane.focused .connection-overlay')
        .waitFor({ state: 'detached', timeout: 25000 })
      const endpoint = await page
        .locator('.terminal-pane.focused .terminal-mount')
        .getAttribute('data-session-id')
      const listing = await page.evaluate(
        (endpoint) => window.quay.invoke('filesList', { endpoint }),
        endpoint
      )
      await page.waitForFunction(
        (expectedPath) => document.querySelector('.terminal-files .file-path input')?.value === expectedPath,
        listing.path
      )
      report.results.push({ address: host.address, port: host.port, ssh: 'passed', sftp: 'passed' })
      console.log(`Packaged ${report.version} ${host.address}:${host.port}: SSH/SFTP passed`)
    }
    const disk = JSON.parse(fs.readFileSync(path.join(directory, 'quayterm.json'), 'utf8'))
    if (disk.hosts.some((host) => Object.hasOwn(host, 'password') || Object.hasOwn(host, 'secret')))
      throw new Error('Test credential found in persisted app data')
    report.credentialsPersisted = false
    const output = path.resolve(
      process.env.QUAYTERM_TEST_REPORT || `.private/packaged-${report.version}.json`
    )
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 })
  } finally {
    if (application) {
      await application.evaluate(({ app }) => app.exit()).catch(() => {})
      await application.close().catch(() => {})
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
