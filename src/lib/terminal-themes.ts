import definitions from '../../shared/terminal-themes.json'
import type { ITheme } from '@xterm/xterm'
import type { CSSProperties } from 'react'

export type TerminalThemeId = keyof typeof definitions
export const terminalThemes = Object.entries(definitions).map(([id, definition]) => ({
  id: id as TerminalThemeId,
  ...definition
}))
export function getTerminalTheme(id?: string) {
  const key = id && Object.hasOwn(definitions, id) ? (id as TerminalThemeId) : 'quay-dark'
  const definition = definitions[key]
  const names = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'brightBlack',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite'
  ]
  const colors: ITheme = {
    background: definition.background,
    foreground: definition.foreground,
    cursor: definition.cursor,
    cursorAccent: definition.background,
    selectionBackground: definition.selection,
    ...Object.fromEntries(names.map((name, i) => [name, definition.palette[i]]))
  }
  const style = {
    '--terminal-bg': definition.background,
    '--terminal-fg': definition.foreground,
    '--terminal-panel': definition.panel,
    '--terminal-border': definition.border,
    '--terminal-muted': definition.muted,
    '--terminal-accent': definition.cursor,
    '--terminal-folder': definition.palette[3],
    '--terminal-selection': definition.selection
  } as CSSProperties
  return { id: key, ...definition, colors, style }
}
