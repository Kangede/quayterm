const { spawn } = require('node:child_process')
const path = require('node:path')
const http = require('node:http')
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' })
let electron
const wait = () => {
  const req = http.get('http://127.0.0.1:5178', (response) => {
    response.resume()
    electron = spawn(require('electron'), ['.'], {
      stdio: 'inherit',
      env: { ...process.env, QUAYTERM_DEV: '1' }
    })
    electron.on('exit', () => vite.kill())
  })
  req.on('error', () => setTimeout(wait, 300))
}
wait()
process.on('SIGINT', () => {
  electron?.kill()
  vite.kill()
})
