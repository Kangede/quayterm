export type Host = {
  id: string
  name: string
  address: string
  port: number
  username: string
  hasPassword: boolean
  tags: string[]
  group: string
  note: string
  color: string
  backspace: 'delete' | 'ctrl-h'
  createdAt: number
  updatedAt: number
  lastConnectedAt: number
}
export type HostDraft = Partial<Host> & { password?: string; rememberPassword?: boolean }
export type KnownHost = {
  id: string
  label: string
  fingerprint: string
  algorithm: string
  createdAt: number
  publicKey: string
}
export type Session = { id: string; host: Host; state: string; message: string; sftpOnly?: boolean }
export type Pane = { id: string; tabs: string[]; active: string | null }
export type LayoutName =
  'single' | 'columns' | 'three-columns' | 'rows' | 'three-rows' | 'grid' | 'right' | 'bottom'
export type Workspace = { layout: LayoutName; panes: Pane[]; focused: string }
export type FileEntry = {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modified: number
  mode: number
  inaccessible: boolean
}
export type FileList = {
  path: string
  parent: string
  separator: string
  entries: FileEntry[]
  roots: string[]
}
export type Transfer = {
  id: string
  name: string
  state: string
  transferred: number
  total: number
  message: string
  source: string
  destination: string
}
export type Settings = {
  view?: 'grid' | 'list'
  sort?: string
  sidebar?: boolean
  fontSize?: number
  showHidden?: boolean
  terminalTheme?: string
  outputHighlights?: boolean
}
export type Verification = {
  id: string
  challengeId: string
  name: string
  label: string
  fingerprint: string
  algorithm: string
}
export type AppEvent = { type: string; [key: string]: any }
declare global {
  interface Window {
    quay: {
      invoke<T = any>(method: string, input?: any): Promise<T>
      terminal(action: string, data: any): void
      onEvent(callback: (event: AppEvent) => void): () => void
      filePath(file: File): string
    }
  }
}
