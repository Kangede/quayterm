import { useEffect, useRef, useState } from 'react'
import { App, Button, Checkbox, Dropdown, Input, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  CloseOutlined,
  CodeOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  LayoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  BgColorsOutlined
} from '@ant-design/icons'
import type { Host, Pane, Session, Workspace, LayoutName, Settings } from '../types'
import { getTerminalTheme, terminalThemes } from '../lib/terminal-themes'
import { layouts } from '../lib/workspace'
import type { Terminals } from '../lib/terminals'
import { FilePane, type FileOpen, type TransferRequest, type FileClipboard } from './Files'
import { HostIcon } from './HostManager'
function TerminalView({ id, pool }: { id: string; pool: Terminals }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) return pool.attach(id, ref.current)
  }, [id, pool])
  return <div className="terminal-canvas" ref={ref} data-testid={`terminal-${id}`} />
}
function TerminalPane({
  pane,
  focused,
  sessions,
  pool,
  onFocus,
  onClose,
  onAdd,
  onMove,
  onReconnect
}: {
  pane: Pane
  focused: boolean
  sessions: Record<string, Session>
  pool: Terminals
  onFocus: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
  onMove: (id: string, before?: string) => void
  onReconnect: (id: string) => void
}) {
  const { message } = App.useApp()
  const [dragging, setDragging] = useState(false)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState(true)
  const session = pane.active ? sessions[pane.active] : undefined
  useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent).detail === pane.active) setFinding(true)
    }
    window.addEventListener('quay-find', listener)
    return () => window.removeEventListener('quay-find', listener)
  }, [pane.active])
  useEffect(() => {
    setFinding(false)
    setQuery('')
  }, [pane.active])
  function find(previous = false, value = query) {
    const search = pane.active ? pool.records.get(pane.active)?.search : undefined
    setMatch(Boolean(previous ? search?.findPrevious(value) : search?.findNext(value)))
  }
  function closeSearch() {
    setFinding(false)
    if (pane.active) {
      pool.records.get(pane.active)?.search.clearDecorations()
      pool.records.get(pane.active)?.term.focus()
    }
  }
  function drop(e: React.DragEvent, before?: string) {
    const id = e.dataTransfer.getData('application/x-quay-session')
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    onMove(id, before)
    setDragging(false)
  }
  return (
    <section
      className={`terminal-pane ${focused ? 'focused' : ''} ${dragging ? 'drag-over' : ''}`}
      data-pane={pane.id}
      onPointerDown={() => {
        if (pane.active) onFocus(pane.active)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-quay-session')) {
          e.preventDefault()
          setDragging(true)
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => drop(e)}
    >
      <div className="pane-tabs">
        <div className="pane-tab-scroll">
          {pane.tabs.map((id) => {
            const s = sessions[id]
            if (!s) return null
            return (
              <div
                role="tab"
                aria-selected={id === pane.active}
                tabIndex={0}
                draggable
                key={id}
                className={`pane-tab ${id === pane.active ? 'active' : ''}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-quay-session', id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => setDragging(false)}
                onDrop={(e) => drop(e, id)}
                onClick={() => onFocus(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFocus(id)
                }}
                title={`${s.host.username}@${s.host.address}:${s.host.port}`}
              >
                <span
                  className={`status-dot ${s.state === 'ready' ? '' : s.state === 'error' || s.state === 'closed' ? 'offline' : 'pending'}`}
                />
                <span>{s.host.name}</span>
                <button
                  aria-label={`关闭会话 ${s.host.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(id)
                  }}
                >
                  <CloseOutlined />
                </button>
              </div>
            )
          })}
        </div>
        <Tooltip title="在此面板添加会话">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            aria-label="面板添加会话"
            onClick={onAdd}
          />
        </Tooltip>
      </div>
      {session ? (
        <>
          <div className="terminal-mini-toolbar">
            <CodeOutlined />
            <span>
              {session.host.username}@{session.host.address}
            </span>
            <span className="toolbar-spacer" />
            <Tooltip title="查找 · Ctrl/⌘ Shift F">
              <Button
                type="text"
                size="small"
                icon={<SearchOutlined />}
                aria-label="查找终端内容"
                onClick={() => setFinding((v) => !v)}
              />
            </Tooltip>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'copy', label: '复制选中文本' },
                  { key: 'paste', label: '粘贴' },
                  { key: 'all', label: '全选终端内容' },
                  { key: 'clear', label: '清除滚动记录' }
                ],
                onClick: async (e) => {
                  const r = pool.records.get(session.id)
                  if (e.key === 'copy') pool.copy(session.id)
                  else if (e.key === 'paste') {
                    try {
                      await pool.paste(session.id)
                    } catch (error: any) {
                      message.error(error.message)
                    }
                  } else if (e.key === 'all') r?.term.selectAll()
                  else r?.term.clear()
                }
              }}
            >
              <Button type="text" size="small" icon={<CopyOutlined />} aria-label="终端操作" />
            </Dropdown>
          </div>
          {finding && (
            <div className="terminal-search">
              <Input
                autoFocus
                aria-label="终端搜索词"
                status={!match && query ? 'error' : undefined}
                placeholder="查找终端内容"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  find(false, e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    find(e.shiftKey)
                  } else if (e.key === 'Escape') {
                    e.stopPropagation()
                    closeSearch()
                  }
                }}
              />
              <Button
                type="text"
                aria-label="上一个匹配"
                icon={<ArrowUpOutlined />}
                onClick={() => find(true)}
              />
              <Button
                type="text"
                aria-label="下一个匹配"
                icon={<ArrowDownOutlined />}
                onClick={() => find()}
              />
              <Button type="text" aria-label="关闭终端查找" icon={<CloseOutlined />} onClick={closeSearch} />
            </div>
          )}
          <div className="terminal-body">
            <TerminalView id={session.id} pool={pool} />
            {session.state !== 'ready' && (
              <div
                className={`connection-overlay ${['closed', 'error'].includes(session.state) ? 'ended' : ''}`}
              >
                <HostIcon host={session.host} />
                <h3>{session.host.name}</h3>
                <p>
                  SSH {session.host.address}:{session.host.port}
                </p>
                {!['closed', 'error'].includes(session.state) && (
                  <div className="connection-track">
                    <i />
                    <CodeOutlined />
                  </div>
                )}
                <p className="connection-message">{session.message || '正在准备连接…'}</p>
                <div className="connection-actions">
                  {['closed', 'error'].includes(session.state) && (
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => onReconnect(session.id)}>
                      重新连接
                    </Button>
                  )}
                  <Button onClick={() => onClose(session.id)}>
                    {['closed', 'error'].includes(session.state) ? '关闭' : '取消连接'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="empty-terminal">
          <span className="empty-terminal-icon">
            <CodeOutlined />
          </span>
          <h3>一个新的工作面板</h3>
          <p>拖入已有会话，或连接另一台主机。</p>
          <Button icon={<PlusOutlined />} onClick={onAdd}>
            连接主机
          </Button>
        </div>
      )}
      {dragging && <div className="drop-hint">松开以移动会话到此面板</div>}
    </section>
  )
}
export function TerminalWorkspace({
  workspace,
  sessions,
  pool,
  appearance,
  fileClipboard,
  onCopyFiles,
  onAppearance,
  hosts,
  sidebar,
  onSidebar,
  onLayout,
  onFocus,
  onClose,
  onAdd,
  onMove,
  onReconnect,
  onOpenFile,
  onTransfer,
  refreshToken
}: {
  workspace: Workspace
  sessions: Record<string, Session>
  pool: Terminals
  fileClipboard: FileClipboard | null
  onCopyFiles: (clipboard: FileClipboard) => void
  appearance: Settings
  onAppearance: (change: Settings) => void
  hosts: Host[]
  sidebar: boolean
  onSidebar: () => void
  onLayout: (id: LayoutName) => void
  onFocus: (pane: string, id: string) => void
  onClose: (id: string) => void
  onAdd: (pane: string) => void
  onMove: (id: string, pane: string, before?: string) => void
  onReconnect: (id: string) => void
  onOpenFile: (file: FileOpen) => void
  onTransfer: (request: TransferRequest) => void
  refreshToken: number
}) {
  const { modal } = App.useApp()
  const theme = getTerminalTheme(appearance.terminalTheme)
  const gridRef = useRef<HTMLDivElement>(null)
  const [sideWidth, setSideWidth] = useState(264)
  const [x, setX] = useState<number[]>([])
  const [y, setY] = useState<number[]>([])
  const layout = layouts.find((l) => l.id === workspace.layout)!
  useEffect(() => {
    setX(Array.from({ length: layout.columns - 1 }, (_, i) => (i + 1) / layout.columns))
    setY(Array.from({ length: layout.rows - 1 }, (_, i) => (i + 1) / layout.rows))
  }, [layout.id])
  const activePane = workspace.panes.find((p) => p.id === workspace.focused) || workspace.panes[0]
  const activeSession = activePane.active ? sessions[activePane.active] : undefined
  function resize(e: React.PointerEvent, axis: 'x' | 'y', index: number) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const element = e.currentTarget as HTMLElement
    const bounds = gridRef.current!.getBoundingClientRect()
    const boundaries = axis === 'x' ? x : y
    const move = (event: PointerEvent) => {
      const value =
        axis === 'x'
          ? (event.clientX - bounds.left) / bounds.width
          : (event.clientY - bounds.top) / bounds.height
      const next = [...boundaries]
      next[index] = Math.max(
        (boundaries[index - 1] || 0) + 0.12,
        Math.min((boundaries[index + 1] || 1) - 0.12, value)
      )
      ;(axis === 'x' ? setX : setY)(next)
    }
    const up = () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
  }
  const sizes = (boundaries: number[], count: number) => {
    if (boundaries.length !== count - 1) return `repeat(${count}, minmax(0, 1fr))`
    const b = [0, ...boundaries, 1]
    return b
      .slice(1)
      .map((v, i) => `minmax(0, ${v - b[i]}fr)`)
      .join(' ')
  }
  return (
    <div className="workspace" data-terminal-theme={theme.id} style={theme.style}>
      <header className="workspace-toolbar">
        <Button
          type="text"
          className={sidebar ? 'enabled' : ''}
          icon={<FolderOpenOutlined />}
          onClick={onSidebar}
          aria-label="切换文件侧栏"
        >
          文件
        </Button>
        <span className="workspace-caption">
          {workspace.panes.length} 个面板 · {workspace.panes.reduce((sum, p) => sum + p.tabs.length, 0)}{' '}
          个会话
        </span>
        <span className="toolbar-spacer" />
        <span className="workspace-drag-tip">拖动标签，在面板间移动会话</span>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                type: 'group',
                label: '终端配色',
                children: terminalThemes.map((t) => ({
                  key: t.id,
                  label: (
                    <span className="theme-option">
                      <span className="theme-swatches" style={{ background: t.background }}>
                        <i style={{ background: t.palette[1] }} />
                        <i style={{ background: t.palette[2] }} />
                        <i style={{ background: t.foreground }} />
                      </span>
                      {t.name}
                      {theme.id === t.id && <CheckOutlined />}
                    </span>
                  )
                }))
              },
              { type: 'divider' },
              {
                key: 'toggle-highlights',
                label: <Checkbox checked={appearance.outputHighlights !== false}>自动高亮输出</Checkbox>
              },
              { key: 'highlight-info', label: '高亮说明' }
            ],
            onClick: ({ key }) => {
              if (key === 'toggle-highlights')
                onAppearance({ outputHighlights: appearance.outputHighlights === false })
              else if (key === 'highlight-info')
                modal.info({
                  title: '自动高亮输出',
                  content:
                    '错误、警告、成功信息和地址会用不同颜色显示。脚本指定的颜色优先保留。高亮仅作用于普通终端输出，进入 tmux、screen 等程序的备用屏幕时自动停用；不会改写输出内容或影响进度条刷新。'
                })
              else onAppearance({ terminalTheme: key })
            }
          }}
        >
          <Button type="text" aria-label="终端风格" icon={<BgColorsOutlined />}>
            风格
          </Button>
        </Dropdown>
        <Dropdown
          trigger={['click']}
          menu={{
            items: layouts.map((l) => ({
              key: l.id,
              icon: (
                <span className={`layout-glyph layout-${l.id}`}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              ),
              label: (
                <span className="layout-label">
                  {l.name}
                  {workspace.layout === l.id && <CheckOutlined />}
                </span>
              )
            })),
            onClick: (e) => onLayout(e.key as LayoutName)
          }}
        >
          <Button type="text" aria-label="终端布局" icon={<LayoutOutlined />}>
            布局
          </Button>
        </Dropdown>
      </header>
      <div className="workspace-content">
        {sidebar && (
          <>
            <aside className="terminal-files" style={{ width: sideWidth }}>
              <FilePane
                endpoint={activeSession?.id || null}
                session={activeSession}
                hosts={hosts}
                compact
                clipboard={fileClipboard}
                onCopy={onCopyFiles}
                onOpen={onOpenFile}
                onTransfer={onTransfer}
                refreshToken={refreshToken}
              />
            </aside>
            <div
              className="sidebar-resizer"
              role="separator"
              onPointerDown={(e) => {
                const el = e.currentTarget
                el.setPointerCapture(e.pointerId)
                const start = e.clientX
                const width = sideWidth
                const move = (event: PointerEvent) =>
                  setSideWidth(Math.max(185, Math.min(480, width + event.clientX - start)))
                const up = () => {
                  el.removeEventListener('pointermove', move)
                  el.removeEventListener('pointerup', up)
                  el.removeEventListener('pointercancel', up)
                }
                el.addEventListener('pointermove', move)
                el.addEventListener('pointerup', up)
                el.addEventListener('pointercancel', up)
              }}
            />
          </>
        )}
        <div
          className={`terminal-grid layout-${layout.id}`}
          ref={gridRef}
          style={{ gridTemplateColumns: sizes(x, layout.columns), gridTemplateRows: sizes(y, layout.rows) }}
        >
          {workspace.panes.map((p) => (
            <TerminalPane
              key={p.id}
              pane={p}
              focused={workspace.focused === p.id}
              sessions={sessions}
              pool={pool}
              onFocus={(id) => onFocus(p.id, id)}
              onClose={onClose}
              onAdd={() => onAdd(p.id)}
              onMove={(id, before) => onMove(id, p.id, before)}
              onReconnect={onReconnect}
            />
          ))}
          {x.map((value, i) => (
            <div
              key={`x${i}`}
              className={`grid-resizer vertical ${layout.id === 'bottom' ? 'lower' : ''}`}
              role="separator"
              style={{
                left: `${value * 100}%`,
                top: layout.id === 'bottom' ? `${(y[0] ?? 0.5) * 100}%` : undefined
              }}
              onPointerDown={(e) => resize(e, 'x', i)}
            />
          ))}
          {y.map((value, i) => (
            <div
              key={`y${i}`}
              className={`grid-resizer horizontal ${layout.id === 'right' ? 'right-half' : ''}`}
              role="separator"
              style={{
                top: `${value * 100}%`,
                left: layout.id === 'right' ? `${(x[0] ?? 0.5) * 100}%` : undefined
              }}
              onPointerDown={(e) => resize(e, 'y', i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
