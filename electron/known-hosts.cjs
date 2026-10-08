const crypto = require('node:crypto')
const { utils } = require('@electerm/ssh2')
function fingerprint(key) {
  return 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}
function algorithm(key) {
  if (!Buffer.isBuffer(key) || key.length < 4) throw new Error('无效的主机公钥')
  const length = key.readUInt32BE(0)
  if (length < 1 || length > key.length - 4) throw new Error('无效的主机公钥')
  return key.subarray(4, length + 4).toString('ascii')
}
function hostLabel(address, port) {
  return Number(port) === 22 ? address : `[${address}]:${port}`
}
function matches(pattern, label) {
  if (pattern.startsWith('|1|')) {
    const [, , salt, expected] = pattern.split('|')
    if (!salt || !expected) return false
    const actual = crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(label).digest()
    const expectedBuffer = Buffer.from(expected, 'base64')
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer)
  }
  return pattern.toLowerCase() === label.toLowerCase()
}
class KnownHosts {
  constructor(store) {
    this.store = store
  }
  list() {
    return this.store.data.knownHosts
  }
  check(address, port, key) {
    const label = hostLabel(address, port)
    const hash = fingerprint(key)
    const entries = this.list().filter((k) => matches(k.label, label))
    const match = entries.find((k) => k.fingerprint === hash)
    if (match) return { state: 'trusted', entry: match }
    return {
      state: entries.length ? 'changed' : 'unknown',
      label,
      fingerprint: hash,
      algorithm: algorithm(key),
      previous: entries.map((k) => k.fingerprint)
    }
  }
  trust(address, port, key) {
    const result = this.check(address, port, key)
    if (result.state === 'changed') throw new Error('主机指纹已改变，连接已阻止')
    if (result.state === 'trusted') return result.entry
    const entry = {
      id: crypto.randomUUID(),
      label: result.label,
      algorithm: result.algorithm,
      fingerprint: result.fingerprint,
      publicKey: key.toString('base64'),
      createdAt: Date.now()
    }
    this.store.data.knownHosts.push(entry)
    this.store.save()
    return entry
  }
  remove(id) {
    this.store.data.knownHosts = this.list().filter((k) => k.id !== id)
    this.store.save()
  }
  import(content) {
    if (typeof content !== 'string' || content.length > 4 * 1024 * 1024)
      throw new Error('known_hosts 文件过大')
    let added = 0
    let skipped = 0
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [labels, algo, base64] = trimmed.split(/\s+/)
      if (!labels || !algo || !base64 || labels.startsWith('@')) {
        skipped++
        continue
      }
      const parsed = utils.parseKey(`${algo} ${base64}`)
      if (parsed instanceof Error) {
        skipped++
        continue
      }
      const key = Buffer.from(base64, 'base64')
      for (const label of labels.split(',')) {
        // Wildcards and negated patterns must never silently broaden trust.
        if (!label || /[!*?]/.test(label)) {
          skipped++
          continue
        }
        const hash = fingerprint(key)
        if (this.list().some((k) => k.label === label && k.fingerprint === hash)) continue
        this.store.data.knownHosts.push({
          id: crypto.randomUUID(),
          label,
          algorithm: algo,
          fingerprint: hash,
          publicKey: base64,
          createdAt: Date.now()
        })
        added++
      }
    }
    this.store.save()
    return { added, skipped }
  }
}
module.exports = { KnownHosts, fingerprint, algorithm, hostLabel, matches }
