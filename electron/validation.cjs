const crypto = require('node:crypto')
function text(value, max = 256) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}
function validateHost(input, previous) {
  const address = text(input.address)
  if (!address || /[\s\x00-\x1f/\\]/.test(address)) throw new Error('请输入有效的主机地址')
  const port = Number(input.port || 22)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须介于 1 和 65535 之间')
  const username = text(input.username)
  if (!username || /[\x00-\x1f]/.test(username)) throw new Error('请输入有效的用户名')
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => text(t, 32)).filter(Boolean))].slice(0, 20)
    : []
  return {
    id: previous?.id || crypto.randomUUID(),
    address,
    port,
    username,
    name: text(input.name) || address,
    tags,
    group: text(input.group, 64),
    note: text(input.note, 2000),
    color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#ed7045',
    backspace: input.backspace === 'ctrl-h' ? 'ctrl-h' : 'delete',
    createdAt: previous?.createdAt || Date.now(),
    updatedAt: Date.now(),
    lastConnectedAt: previous?.lastConnectedAt || 0
  }
}
function dimensions(cols, rows) {
  if (![cols, rows].every((n) => Number.isInteger(n) && n >= 2 && n <= 1000)) throw new Error('终端尺寸无效')
  return { cols, rows }
}
function safePath(p) {
  if (typeof p !== 'string' || !p || p.length > 32768 || p.includes('\0')) throw new Error('文件路径无效')
  return p
}
function filename(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\x00-\x1f]/.test(name))
    throw new Error('文件名无效')
  return name
}
module.exports = { validateHost, dimensions, safePath, filename }
