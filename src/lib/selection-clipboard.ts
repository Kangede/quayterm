// A remote clipboard write is accepted once, immediately after a real local
// mouse selection. Merely enabling copy-on-select never grants a remote shell
// continuous access to the clipboard. Reads are never supported.
export class SelectionClipboard {
  private until = 0
  constructor(private now: () => number = () => performance.now()) {}
  arm() {
    this.until = this.now() + 1500
  }
  cancel() {
    this.until = 0
  }
  read(data: string): string | undefined {
    if (!this.until || this.now() > this.until) return
    const separator = data.indexOf(';')
    if (separator < 0 || !/^[cpqs0-7]*$/.test(data.slice(0, separator))) return
    const encoded = data.slice(separator + 1)
    if (
      !encoded ||
      encoded === '?' ||
      encoded.length > 1398104 ||
      encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    )
      return
    try {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
      if (bytes.length > 1048576) return
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!text) return
      this.cancel()
      return text
    } catch {
      return
    }
  }
}
