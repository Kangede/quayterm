const { Server } = require('@electerm/ssh2')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const SFTP_SERVER =
  process.env.QUAYTERM_SFTP_SERVER ||
  path.resolve(__dirname, '../.private/tooling/usr/lib/openssh/sftp-server')
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quayterm-fixture-'))
  fs.mkdirSync(path.join(root, 'screen'), { mode: 0o700 })
  fs.writeFileSync(
    path.join(root, 'tmux.conf'),
    'set -g default-command \"bash --noprofile --norc\"\nset -g status-left-length 40\nset -g status-left \"[#S] \"\n'
  )
  fs.mkdirSync(path.join(root, 'documents'))
  fs.writeFileSync(path.join(root, 'hello.txt'), 'QuayTerm fixture\n你好，世界 🌏\n')
  fs.writeFileSync(path.join(root, '.hidden'), 'hidden')
  const privateKey = crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
  const clients = new Set()
  const children = new Set()
  const inputs = []
  const sizes = []
  const shells = []
  const outputChannels = new Set()
  const server = new Server({ hostKeys: [privateKey] }, (client) => {
    clients.add(client)
    client.on('error', (error) => {
      if (process.env.QUAYTERM_FIXTURE_DEBUG) console.error('fixture:', error)
    })
    client.on('close', () => clients.delete(client))
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'fixture-password')
        ctx.accept()
      else ctx.reject(['password'])
    })
    client.on('ready', () =>
      client.on('session', (accept) => {
        const session = accept()
        let size = { cols: 100, rows: 30 }
        let child
        session.on('pty', (accept, _reject, info) => {
          size = { cols: info.cols, rows: info.rows }
          sizes.push(size)
          accept()
        })
        session.on('env', (accept) => accept?.())
        session.on('window-change', (accept, _reject, info) => {
          size = { cols: info.cols, rows: info.rows }
          sizes.push(size)
          child?.stdio[3]?.write(JSON.stringify(size) + '\n')
          accept?.()
        })
        session.on('shell', (accept) => {
          const stream = accept()
          outputChannels.add(stream)
          child = spawn('python3', [path.join(__dirname, 'pty-fixture.py'), root], {
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
          })
          children.add(child)
          shells.push(child.pid)
          child.stdio[3].write(JSON.stringify(size) + '\n')
          child.stdio[3].on('error', () => {})
          child.stdin.on('error', () => {})
          stream.on('data', (data) => inputs.push(Buffer.from(data)))
          stream.pipe(child.stdin)
          child.stdout.pipe(stream)
          child.stderr.on('data', () => {})
          child.on('close', () => {
            children.delete(child)
            stream.exit(0)
            stream.end()
          })
          stream.on('close', () => {
            outputChannels.delete(stream)
            child.kill()
          })
        })
        session.on('subsystem', (accept, reject, info) => {
          if (info.name !== 'sftp') return reject()
          const stream = accept()
          const process = spawn(SFTP_SERVER, ['-d', root], { stdio: ['pipe', 'pipe', 'pipe'] })
          children.add(process)
          process.stdin.on('error', () => {})
          process.on('error', (error) => stream.destroy(error))
          process.stderr.on('data', () => {})
          stream.pipe(process.stdin)
          process.stdout.pipe(stream)
          stream.on('close', () => process.kill())
          process.on('close', () => {
            children.delete(process)
            stream.exit(0)
            stream.end()
          })
        })
      })
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const host = {
    name: '本地集成测试',
    address: '127.0.0.1',
    port: server.address().port,
    username: 'tester',
    password: 'fixture-password',
    rememberPassword: false,
    tags: ['测试'],
    color: '#35a78e'
  }
  return {
    server,
    root,
    host,
    inputs,
    sizes,
    shells,
    output(data) {
      for (const channel of outputChannels) channel.write(data)
    },
    async close() {
      // Only test-specific multiplexers are touched; never the user's existing server.
      const tmux = process.env.QUAYTERM_TMUX || path.resolve(__dirname, '../.private/tooling/usr/bin/tmux')
      spawnSync(tmux, ['-S', path.join(root, 'tmux.sock'), 'kill-server'], {
        env: {
          ...process.env,
          LD_LIBRARY_PATH: path.resolve(__dirname, '../.private/tooling/usr/lib/x86_64-linux-gnu')
        },
        timeout: 2000
      })
      spawnSync('screen', ['-S', 'quayterm-test', '-X', 'quit'], {
        env: { ...process.env, SCREENDIR: path.join(root, 'screen') },
        timeout: 2000
      })
      for (const child of children) child.kill()
      for (const client of clients) client.end()
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
}
module.exports = { fixture }
