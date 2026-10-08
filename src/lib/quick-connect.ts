export function parseQuickConnect(value: string) {
  let text = value.trim().replace(/^ssh\s+/, '')
  let port = 22
  const flag = text.match(/(?:^|\s)-p\s+(\d+)(?=\s|$)/)
  if (flag) {
    port = Number(flag[1])
    text = text.replace(flag[0], '').trim()
  }
  text = text.replace(/^ssh:\/\//, '')
  const match = text.match(/^(?:([^\s@:]+)@)?(\[[0-9a-f:]+\]|[^\s:/@]+)(?::(\d+))?$/i)
  if (!match) return null
  if (match[3]) port = Number(match[3])
  if (port < 1 || port > 65535) return null
  return { address: match[2].replace(/^\[|\]$/g, ''), username: match[1] || 'root', port, name: match[2] }
}
