import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Host } from '../types'
export type TerminalRecord = {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  element: HTMLDivElement
  opened: boolean
  observer?: ResizeObserver
}
export class Terminals {
  records = new Map<string, TerminalRecord>()
  fontSize = 14
  onPaste: (text: string, accept: () => void) => void = (_text, accept) => accept()
  create(id: string, host: Host) {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"Quay Mono", "Cascadia Code", "SFMono-Regular", "DejaVu Sans Mono", Consolas, monospace',
      fontSize: this.fontSize,
      lineHeight: 1.17,
      scrollback: 10000,
      allowProposedApi: true,
      screenReaderMode: false,
      rightClickSelectsWord: true,
      theme: {
        background: '#141827',
        foreground: '#cbd4e3',
        cursor: '#80cbc4',
        selectionBackground: '#3e536b',
        black: '#1c2331',
        red: '#ef7d85',
        green: '#83cfac',
        yellow: '#e5c889',
        blue: '#8eb8f5',
        magenta: '#c6a0df',
        cyan: '#80cbc4',
        white: '#cbd4e3',
        brightBlack: '#6b7894',
        brightRed: '#ffa2a9',
        brightGreen: '#ade6c8',
        brightYellow: '#f9e2af',
        brightBlue: '#aecbfa',
        brightMagenta: '#dbbaf0',
        brightCyan: '#a3e2dd',
        brightWhite: '#f3f5f9'
      }
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    const unicode = new Unicode11Addon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(unicode)
    term.unicode.activeVersion = '11'
    // Remote applications cannot read or replace the local clipboard through OSC 52.
    term.parser.registerOscHandler(52, () => true)
    term.onData((data) => window.quay.terminal('write', { id, data }))
    term.onBinary((data) => window.quay.terminal('write', { id, data, binary: true }))
    term.onResize(({ cols, rows }) => window.quay.terminal('resize', { id, cols, rows }))
    term.attachCustomKeyEventHandler((event) => {
      const command = event.metaKey || (event.ctrlKey && event.shiftKey)
      if (command && ['c', 'v', 'f'].includes(event.key.toLowerCase())) {
        if (event.type === 'keydown') {
          if (event.key.toLowerCase() === 'c') this.copy(id)
          if (event.key.toLowerCase() === 'v') this.paste(id)
          if (event.key.toLowerCase() === 'f')
            window.dispatchEvent(new CustomEvent('quay-find', { detail: id }))
          event.preventDefault()
        }
        return false
      }
      if (
        (event.ctrlKey && event.shiftKey && ['t', 'w', 'k', 'b'].includes(event.key.toLowerCase())) ||
        (event.ctrlKey && event.key === 'Tab') ||
        (event.altKey && /^[1-9]$/.test(event.key))
      )
        return false
      if (
        event.key === 'Backspace' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        host.backspace === 'ctrl-h'
      ) {
        if (event.type === 'keydown') window.quay.terminal('write', { id, data: '\b' })
        return false
      }
      return true
    })
    const element = document.createElement('div')
    element.className = 'terminal-mount'
    element.dataset.sessionId = id
    this.records.set(id, { term, fit, search, element, opened: false })
  }
  attach(id: string, container: HTMLElement) {
    const r = this.records.get(id)
    if (!r) return () => {}
    container.appendChild(r.element)
    if (!r.opened) {
      r.term.open(r.element)
      r.opened = true
    }
    const fit = () => {
      if (r.element.isConnected && container.clientWidth > 30 && container.clientHeight > 30) {
        try {
          r.fit.fit()
        } catch {}
      }
    }
    r.observer?.disconnect()
    r.observer = new ResizeObserver(fit)
    r.observer.observe(container)
    const raf = requestAnimationFrame(() => {
      fit()
      r.term.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      r.observer?.disconnect()
      if (r.element.parentElement === container) r.element.remove()
    }
  }
  data(id: string, base64: string, bytes: number) {
    const r = this.records.get(id)
    if (!r) {
      window.quay.terminal('ack', { id, bytes })
      return
    }
    const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    r.term.write(buffer, () => window.quay.terminal('ack', { id, bytes }))
  }
  copy(id: string) {
    const text = this.records.get(id)?.term.getSelection()
    if (text) void window.quay.invoke('clipboardWrite', { text })
  }
  async paste(id: string) {
    const text = await window.quay.invoke<string>('clipboardRead')
    const r = this.records.get(id)
    if (r && text)
      this.onPaste(text, () => {
        r.term.paste(text)
        r.term.focus()
      })
  }
  resizeFont(size: number) {
    this.fontSize = size
    for (const r of this.records.values()) {
      r.term.options.fontSize = size
      if (r.element.isConnected) r.fit.fit()
    }
  }
  close(id: string) {
    const r = this.records.get(id)
    r?.observer?.disconnect()
    r?.term.dispose()
    r?.element.remove()
    this.records.delete(id)
  }
  dispose() {
    for (const id of this.records.keys()) this.close(id)
  }
}
