const { EventEmitter } = require('node:events')
const { Client } = require('@electerm/ssh2')
const crypto = require('node:crypto')
const { dimensions } = require('./validation.cjs')
class Sessions extends EventEmitter {
  constructor(store, known) {
    super()
    this.store = store
    this.known = known
    this.items = new Map()
    this.challenges = new Map()
  }
  event(type, payload) {
    this.emit('event', { type, ...payload })
  }
  status(session, state, message = '') {
    session.state = state
    this.event('session-status', { id: session.id, state, message })
  }
  start({ id, hostId, password, cols = 100, rows = 30, sftpOnly = false }) {
    if (typeof id !== 'string' || id.length > 100 || this.items.has(id)) throw new Error('会话标识无效或重复')
    dimensions(cols, rows)
    const host = this.store.get(hostId)
    const secret = password ?? this.store.password(hostId)
    if (typeof secret !== 'string') throw new Error('请输入密码')
    const client = new Client()
    const s = {
      id,
      hostId,
      host: this.store.publicHost(host),
      client,
      cols,
      rows,
      state: 'connecting',
      sftpOnly,
      unacked: 0,
      ended: false
    }
    this.items.set(id, s)
    queueMicrotask(() => {
      this.status(s, 'connecting', '正在连接 SSH 服务…')
      client.on('error', (error) => {
        if (!s.ended) {
          this.status(s, 'error', s.failure || error.message)
          s.rejectReady?.(error)
        }
      })
      client.on('close', () => {
        s.ended = true
        this.cancelChallenges(id)
        s.rejectReady?.(new Error('连接已关闭'))
        if (s.state !== 'error') this.status(s, 'closed', '连接已关闭')
      })
      client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        // Password-only authentication. Never answer OTP or arbitrary challenges with the password.
        finish(prompts.map((p) => (/password|密码/i.test(p.prompt) && !p.echo ? secret : '')))
      })
      client.on('ready', () => {
        if (s.ended) return
        s.authenticated = true
        s.resolveReady?.()
        this.store.connected(hostId)
        if (sftpOnly) {
          this.status(s, 'ready', 'SFTP 已连接')
          return
        }
        client.shell(
          { term: 'xterm-256color', cols: s.cols, rows: s.rows, width: 0, height: 0 },
          { env: { COLORTERM: 'truecolor' } },
          (error, channel) => {
            if (error) {
              this.status(s, 'error', error.message)
              client.end()
              return
            }
            if (s.ended) {
              channel.close()
              return
            }
            s.channel = channel
            const send = (data) => {
              s.unacked += data.length
              this.event('terminal-data', { id, data: data.toString('base64'), bytes: data.length })
              if (s.unacked > 262144) channel.pause()
            }
            channel.on('data', send)
            channel.stderr.on('data', send)
            channel.on('error', (err) => this.status(s, 'error', err.message))
            channel.on('close', () => {
              if (!s.ended) {
                this.status(s, 'closed', '远程终端已退出')
                client.end()
              }
            })
            channel.setWindow(s.rows, s.cols, 0, 0)
            this.status(s, 'ready', 'SSH 已连接')
          }
        )
      })
      try {
        client.connect({
          host: host.address,
          port: host.port,
          username: host.username,
          password: secret,
          readyTimeout: 120000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3,
          tryKeyboard: true,
          hostVerifier: (key, verify) => {
            const result = this.known.check(host.address, host.port, key)
            if (result.state === 'trusted') {
              this.status(s, 'authenticating', '正在验证凭证…')
              verify(true)
              return
            }
            if (result.state === 'changed') {
              s.failure = `主机指纹已改变，已阻止连接。当前 ${result.fingerprint}；原指纹 ${result.previous.join('、')}。请核实后在“已知主机”中移除旧记录。`
              verify(false)
              return
            }
            const challengeId = crypto.randomUUID()
            const timer = setTimeout(() => {
              this.respond(challengeId, false)
            }, 90000)
            this.challenges.set(challengeId, {
              sessionId: id,
              verify,
              timer,
              key,
              address: host.address,
              port: host.port
            })
            this.status(s, 'verifying', '等待确认主机指纹…')
            this.event('host-verification', { id, challengeId, ...result, name: host.name })
          }
        })
      } catch (e) {
        this.status(s, 'error', e.message)
        client.destroy()
      }
    })
    return { id }
  }
  respond(challengeId, accept) {
    const c = this.challenges.get(challengeId)
    if (!c) return
    clearTimeout(c.timer)
    this.challenges.delete(challengeId)
    const s = this.items.get(c.sessionId)
    try {
      if (accept && s && !s.ended) {
        this.known.trust(c.address, c.port, c.key)
        this.status(s, 'authenticating', '正在验证凭证…')
        c.verify(true)
      } else {
        if (s) s.failure = '已取消主机验证'
        c.verify(false)
      }
    } catch (e) {
      if (s) s.failure = e.message
      c.verify(false)
    }
  }
  cancelChallenges(id) {
    for (const [key, c] of this.challenges) if (c.sessionId === id) this.respond(key, false)
  }
  get(id) {
    const s = this.items.get(id)
    if (!s || s.ended) throw new Error('会话已断开，请重新连接')
    return s
  }
  write(id, data, binary = false) {
    const s = this.get(id)
    if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('输入数据无效')
    if (s.channel?.writable) s.channel.write(binary ? Buffer.from(data, 'latin1') : data)
  }
  resize(id, cols, rows) {
    const s = this.get(id)
    Object.assign(s, dimensions(cols, rows))
    if (s.channel) s.channel.setWindow(rows, cols, 0, 0)
  }
  ack(id, bytes) {
    const s = this.items.get(id)
    if (!s || !Number.isFinite(bytes) || bytes < 0) return
    s.unacked = Math.max(0, s.unacked - Math.min(bytes, 1024 * 1024))
    if (s.unacked < 65536) s.channel?.resume()
  }
  async sftp(id) {
    const s = this.get(id)
    if (!s.authenticated) throw new Error('连接尚未就绪')
    if (!s.sftpPromise)
      s.sftpPromise = new Promise((resolve, reject) =>
        s.client.sftp((err, ftp) => {
          if (err) {
            s.sftpPromise = null
            reject(err)
          } else {
            ftp.on('error', () => {
              s.sftpPromise = null
            })
            ftp.on('close', () => {
              s.sftpPromise = null
            })
            resolve(ftp)
          }
        })
      )
    return s.sftpPromise
  }
  close(id) {
    const s = this.items.get(id)
    if (!s) return
    s.ended = true
    this.cancelChallenges(id)
    s.client.destroy()
    this.status(s, 'closed', '连接已关闭')
    this.items.delete(id)
  }
  closeAll() {
    for (const id of this.items.keys()) this.close(id)
  }
}
module.exports = { Sessions }
