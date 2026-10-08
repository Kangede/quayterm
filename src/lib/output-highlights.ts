import type { Terminal, IBufferLine, IDisposable, ITheme } from '@xterm/xterm'

export type HighlightKind = 'error' | 'warning' | 'success' | 'info' | 'address' | 'url'
export type HighlightSpan = { x: number; width: number; kind: HighlightKind }
const patterns: [HighlightKind, RegExp][] = [
  ['url', /\bhttps?:\/\/[^\s<>"']+/gi],
  [
    'error',
    /\b(?:ERROR|FATAL|FAIL(?:ED|URE)?|EXCEPTION|PANIC|CRITICAL|TRACEBACK|[a-z_]\w*(?:Error|Exception))\b|错误|失败|异常/gi
  ],
  ['warning', /\b(?:WARN(?:ING)?|DEPRECATED|[a-z_]\w*Warning)\b|警告/gi],
  ['success', /\b(?:SUCCESS(?:FUL)?|PASSED|OK|DONE)\b|成功|已完成/gi],
  ['info', /\b(?:INFO|NOTICE|DEBUG)\b/gi],
  ['address', /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g]
]
const palette: Record<HighlightKind, keyof ITheme> = {
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'cyan',
  address: 'blue',
  url: 'magenta'
}

// Derive highlights from the parsed cells, never from (possibly split) SSH byte
// chunks. This preserves CR redraw, cursor movement, UTF-8 and script colors.
export function highlightSpans(line: IBufferLine): HighlightSpan[] {
  let text = ''
  const cells: { x: number; width: number; start: number; end: number; plain: boolean }[] = []
  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x)
    if (!cell || !cell.getWidth()) continue
    const start = text.length
    text += cell.getChars() || ' '
    cells.push({
      x,
      width: cell.getWidth(),
      start,
      end: text.length,
      plain: cell.isFgDefault() && cell.isBgDefault() && !cell.isInverse() && !cell.isInvisible()
    })
  }
  const occupied = new Set<number>()
  const spans: HighlightSpan[] = []
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      if (
        kind === 'address' &&
        match[0]
          .split(':')[0]
          .split('.')
          .some((octet) => Number(octet) > 255)
      )
        continue
      const end = match.index! + match[0].length
      let current: HighlightSpan | undefined
      for (const cell of cells) {
        if (cell.start >= end) break
        if (cell.end <= match.index! || !cell.plain || occupied.has(cell.x)) {
          current = undefined
          continue
        }
        occupied.add(cell.x)
        if (current && current.x + current.width === cell.x) current.width += cell.width
        else {
          current = { x: cell.x, width: cell.width, kind }
          spans.push(current)
        }
      }
    }
  }
  return spans
}

export class OutputHighlights {
  private handles: IDisposable[] = []
  private subscriptions: IDisposable[] = []
  private frame = 0
  private disposed = false
  constructor(
    private term: Terminal,
    private colors: () => ITheme,
    public enabled = true
  ) {
    this.subscriptions.push(
      term.onWriteParsed(() => this.schedule()),
      term.onScroll(() => this.schedule()),
      term.onResize(() => this.schedule()),
      term.buffer.onBufferChange(() => {
        this.clear()
        this.schedule()
      })
    )
  }
  schedule() {
    if (this.disposed || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }
  private clear() {
    for (const handle of this.handles) handle.dispose()
    this.handles = []
  }
  private render() {
    this.clear()
    const { term } = this
    if (!this.enabled || term.buffer.active.type !== 'normal' || !term.element?.isConnected) return
    const buffer = term.buffer.active
    const colors = this.colors()
    let count = 0
    for (let y = buffer.viewportY; y < Math.min(buffer.length, buffer.viewportY + term.rows); y++) {
      const line = buffer.getLine(y)
      if (!line) continue
      const spans = highlightSpans(line)
      if (!spans.length) continue
      const marker = term.registerMarker(y - buffer.baseY - buffer.cursorY)
      if (!marker) continue
      this.handles.push(marker)
      for (const span of spans) {
        if (count++ >= 512) return
        const decoration = term.registerDecoration({
          marker,
          x: span.x,
          width: span.width,
          foregroundColor: colors[palette[span.kind]] as string,
          layer: 'bottom'
        })
        if (decoration) this.handles.push(decoration)
      }
    }
  }
  update(enabled: boolean) {
    this.enabled = enabled
    this.clear()
    this.schedule()
  }
  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.clear()
    this.subscriptions.forEach((s) => s.dispose())
  }
}
