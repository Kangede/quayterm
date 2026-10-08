// Read-only LAN smoke test. Credentials are read from a private, external JSON file.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { Store } = require('../electron/store.cjs')
const { KnownHosts } = require('../electron/known-hosts.cjs')
const { Sessions } = require('../electron/sessions.cjs')
const { Files } = require('../electron/files.cjs')
async function main() {
  const credentials = process.env.QUAYTERM_TEST_HOSTS
  if (!credentials)
    throw new Error('Set QUAYTERM_TEST_HOSTS to a private JSON host file outside the distributable app')
  const hosts = JSON.parse(fs.readFileSync(credentials, 'utf8'))
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-lan-'))
  const store = new Store(directory)
  const known = new KnownHosts(store)
  const sessions = new Sessions(store, known)
  const files = new Files(sessions)
  const report = {
    time: new Date().toISOString(),
    scope:
      'SSH password authentication, new PTY, resize and read-only SFTP listing. No remote shell commands or writes.',
    results: []
  }
  try {
    for (const input of hosts) {
      const host = store.upsert({ ...input, rememberPassword: false })
      const id = crypto.randomUUID()
      let bytes = 0
      let fingerprint
      const result = { address: host.address, port: host.port, username: host.username }
      const listener = (event) => {
        if (event.id !== id) return
        if (event.type === 'host-verification') {
          fingerprint = event.fingerprint
          sessions.respond(event.challengeId, true)
        }
        if (event.type === 'terminal-data') {
          bytes += event.bytes
          sessions.ack(id, event.bytes)
        }
      }
      sessions.on('event', listener)
      try {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer)
            sessions.off('event', state)
          }
          const state = (event) => {
            if (event.id === id && event.type === 'session-status') {
              if (event.state === 'ready') {
                cleanup()
                resolve()
              } else if (event.state === 'error') {
                cleanup()
                reject(new Error(event.message))
              }
            }
          }
          const timer = setTimeout(() => {
            cleanup()
            reject(new Error('Connection timeout'))
          }, 25000)
          sessions.on('event', state)
          sessions.start({ id, hostId: host.id })
        })
        sessions.resize(id, 117, 37)
        const list = await files.list(id)
        await new Promise((resolve) => setTimeout(resolve, 800))
        Object.assign(result, {
          ssh: 'passed',
          resizeRequest: 'sent',
          sftp: 'passed',
          home: list.path,
          entryCount: list.entries.length,
          terminalBytes: bytes,
          fingerprint
        })
      } catch (error) {
        Object.assign(result, { error: error.message })
        process.exitCode = 1
      } finally {
        sessions.close(id)
        sessions.off('event', listener)
      }
      report.results.push(result)
      console.log(
        `${host.address}:${host.port} SSH=${result.ssh || 'failed'} SFTP=${result.sftp || 'failed'} terminal=${bytes} bytes${result.error ? ` error=${result.error}` : ''}`
      )
    }
  } finally {
    sessions.closeAll()
    fs.rmSync(directory, { recursive: true, force: true })
  }
  const output = process.env.QUAYTERM_TEST_REPORT || path.resolve('.private/lan-report.json')
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 })
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
