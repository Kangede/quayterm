const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { validateHost } = require('./validation.cjs')
class Store {
  constructor(directory, vault) {
    this.directory = directory
    this.vault = vault
    this.passwords = new Map()
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = path.join(directory, 'quayterm.json')
    this.data = { version: 1, hosts: [], knownHosts: [], settings: {} }
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.hosts) || !Array.isArray(data.knownHosts))
        throw new Error('本地数据格式无效，已停止加载以保护原始文件')
      this.data = { ...this.data, ...data }
    }
  }
  secure() {
    return Boolean(
      this.vault?.isEncryptionAvailable() && this.vault?.getSelectedStorageBackend?.() !== 'basic_text'
    )
  }
  save() {
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    fs.renameSync(temp, this.file)
  }
  publicHost(h) {
    const { secret, ...rest } = h
    return { ...rest, hasPassword: Boolean(secret || this.passwords.has(h.id)) }
  }
  list() {
    return this.data.hosts.map((h) => this.publicHost(h))
  }
  get(id) {
    const h = this.data.hosts.find((h) => h.id === id)
    if (!h) throw new Error('主机不存在')
    return h
  }
  password(id) {
    if (this.passwords.has(id)) return this.passwords.get(id)
    const secret = this.get(id).secret
    if (!secret) return ''
    try {
      return this.vault.decryptString(Buffer.from(secret, 'base64'))
    } catch {
      throw new Error('无法解密已保存的密码，请重新输入')
    }
  }
  upsert(input) {
    const previous = input.id ? this.get(input.id) : undefined
    const h = validateHost(input, previous)
    if (previous?.secret) h.secret = previous.secret
    if (typeof input.password === 'string') {
      delete h.secret
      this.passwords.delete(h.id)
      if (input.password) {
        if (input.password.length > 16384) throw new Error('密码过长')
        this.passwords.set(h.id, input.password)
        if (input.rememberPassword !== false && this.secure())
          h.secret = this.vault.encryptString(input.password).toString('base64')
      }
    } else if (input.rememberPassword === false && h.secret) {
      this.passwords.set(h.id, this.password(h.id))
      delete h.secret
    }
    const index = this.data.hosts.findIndex((x) => x.id === h.id)
    if (index < 0) this.data.hosts.push(h)
    else this.data.hosts[index] = h
    this.save()
    return this.publicHost(h)
  }
  remove(id) {
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    this.passwords.delete(id)
    this.save()
  }
  connected(id) {
    const h = this.data.hosts.find((h) => h.id === id)
    if (h) {
      h.lastConnectedAt = Date.now()
      this.save()
    }
  }
  settings(input) {
    const allowed = {
      view: ['grid', 'list'],
      sort: ['az', 'za', 'newest', 'oldest'],
      terminalTheme: Object.keys(require('../shared/terminal-themes.json'))
    }
    for (const key of Object.keys(allowed))
      if (allowed[key].includes(input[key])) this.data.settings[key] = input[key]
    for (const key of ['sidebar', 'showHidden', 'outputHighlights', 'copyOnSelect'])
      if (typeof input[key] === 'boolean') this.data.settings[key] = input[key]
    if (Number.isInteger(input.fontSize) && input.fontSize >= 10 && input.fontSize <= 26)
      this.data.settings.fontSize = input.fontSize
    this.save()
    return this.data.settings
  }
}
module.exports = { Store }
