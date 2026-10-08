import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Host, Settings } from '../types'
import { getTerminalTheme } from './terminal-themes'
import { OutputHighlights } from './output-highlights'
export type TerminalRecord = {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  element: HTMLDivElement
  opened: boolean
  highlights: OutputHighlights
  observer?: ResizeObserver
}
export class Terminals {
  records = new Map<string, TerminalRecord>()
  fontSize = 14
  theme = getTerminalTheme()
  outputHighlights = true
  copyOnSelect = false
  onClipboardError: (message: string) => void = () => {}
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
      theme: this.theme.colors
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
    // xterm fires this after a mouse selection is completed (or Select All).
    // Empty selections must never replace the user's clipboard.
    term.onSelectionChange(() => {
      if (this.copyOnSelect && term.element?.isConnected) this.copy(id)
    })
    term.attachCustomKeyEventHandler((event) => {
      if (event.metaKey && event.key.toLowerCase() === 'a') {
        if (event.type === 'keydown') {
          term.selectAll()
          event.preventDefault()
        }
        return false
      }
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
    const highlights = new OutputHighlights(term, () => this.theme.colors, this.outputHighlights)
    this.records.set(id, { term, fit, search, element, opened: false, highlights })
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
      r.highlights.schedule()
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
    if (text)
      void window.quay
        .invoke('clipboardWrite', { text })
        .catch((error) => this.onClipboardError(error?.message || '无法复制到剪贴板'))
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
  configure(settings: Settings) {
    if (settings.terminalTheme !== undefined) this.theme = getTerminalTheme(settings.terminalTheme)
    if (settings.outputHighlights !== undefined) this.outputHighlights = settings.outputHighlights
    if (settings.copyOnSelect !== undefined) this.copyOnSelect = settings.copyOnSelect
    for (const record of this.records.values()) {
      record.term.options.theme = this.theme.colors
      record.highlights.update(this.outputHighlights)
    }
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
    r?.highlights.dispose()
    r?.term.dispose()
    r?.element.remove()
    this.records.delete(id)
  }
  dispose() {
    for (const id of this.records.keys()) this.close(id)
  }
}
