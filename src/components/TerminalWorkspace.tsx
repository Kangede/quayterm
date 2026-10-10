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
import type { DockSide, Host, Pane, Session, Workspace, LayoutName, Settings } from '../types'
import { getTerminalTheme, terminalThemes } from '../lib/terminal-themes'
import { layouts, workspaceGeometry, type PaneBounds } from '../lib/workspace'
import type { Terminals } from '../lib/terminals'
import {
  FilePane,
  type FileOpen,
  type TransferRequest,
  type FileClipboard,
  type FilePaneSnapshot
} from './Files'
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
  copyOnSelect,
  onCopyOnSelect,
  onFocus,
  onClose,
  onAdd,
  onMove,
  onDock,
  onDragSession,
  draggedSession,
  bounds,
  onReconnect
}: {
  pane: Pane
  focused: boolean
  sessions: Record<string, Session>
  pool: Terminals
  copyOnSelect: boolean
  onCopyOnSelect: (enabled: boolean) => void
  onFocus: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
  onMove: (id: string, before?: string) => void
  onDock: (id: string, side: DockSide) => void
  onDragSession: (id: string | null) => void
  draggedSession: string | null
  bounds: PaneBounds
  onReconnect: (id: string) => void
}) {
  const { message } = App.useApp()
  const [dragging, setDragging] = useState<DockSide | 'center' | null>(null)
  useEffect(() => {
    if (!draggedSession) setDragging(null)
  }, [draggedSession])
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
  function dropSide(e: React.DragEvent): DockSide | 'center' {
    if (
      (e.target as HTMLElement).closest('.pane-tabs') ||
      !pane.tabs.length ||
      (pane.tabs.length === 1 && pane.tabs[0] === draggedSession)
    )
      return 'center'
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top - 36) / Math.max(1, rect.height - 36)
    const edges: [DockSide, number][] = [
      ['left', x],
      ['right', 1 - x],
      ['top', y],
      ['bottom', 1 - y]
    ]
    edges.sort((a, b) => a[1] - b[1])
    return edges[0][1] < 0.25 ? edges[0][0] : 'center'
  }
  function drop(e: React.DragEvent, before?: string) {
    const id = e.dataTransfer.getData('application/x-quay-session')
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    const side = before ? 'center' : dropSide(e)
    if (side === 'center') onMove(id, before)
    else onDock(id, side)
    setDragging(null)
    onDragSession(null)
  }
  return (
    <section
      className={`terminal-pane ${focused ? 'focused' : ''} ${dragging ? 'drag-over' : ''}`}
      data-pane={pane.id}
      style={{
        left: `calc(${bounds.left * 100}% + ${bounds.left ? 2 : 0}px)`,
        top: `calc(${bounds.top * 100}% + ${bounds.top ? 2 : 0}px)`,
        width: `calc(${bounds.width * 100}% - ${(bounds.left ? 2 : 0) + (bounds.left + bounds.width < 0.99999 ? 2 : 0)}px)`,
        height: `calc(${bounds.height * 100}% - ${(bounds.top ? 2 : 0) + (bounds.top + bounds.height < 0.99999 ? 2 : 0)}px)`
      }}
      onPointerDown={() => {
        if (pane.active) onFocus(pane.active)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-quay-session')) {
          e.preventDefault()
          setDragging(dropSide(e))
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null)
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
                  onDragSession(id)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  onDragSession(null)
                }}
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
                  { type: 'divider' },
                  {
                    key: 'copy-on-select',
                    label: <Checkbox checked={copyOnSelect}>选中文本后自动复制</Checkbox>
                  },
                  { type: 'divider' },
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
                  else if (e.key === 'copy-on-select') onCopyOnSelect(!copyOnSelect)
                  else r?.term.clear()
                }
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                aria-label="终端操作"
                title="终端操作"
              />
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
      {dragging && (
        <div className={`drop-hint drop-${dragging}`} data-drop-side={dragging}>
          {dragging === 'center'
            ? '松开以移动会话到此面板'
            : `松开以在${{ left: '左', right: '右', top: '上', bottom: '下' }[dragging]}方分屏`}
        </div>
      )}
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
  onDock,
  onResize,
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
  onDock: (id: string, pane: string, side: DockSide) => void
  onResize: (id: string, ratio: number) => void
  onReconnect: (id: string) => void
  onOpenFile: (file: FileOpen) => void
  onTransfer: (request: TransferRequest) => void
  refreshToken: number
}) {
  const { modal } = App.useApp()
  const theme = getTerminalTheme(appearance.terminalTheme)
  const gridRef = useRef<HTMLDivElement>(null)
  const [sideWidth, setSideWidth] = useState(264)
  const [draggedSession, setDraggedSession] = useState<string | null>(null)
  const fileStates = useRef(new Map<string, FilePaneSnapshot>())
  const geometry = workspaceGeometry(workspace.tree)
  useEffect(() => {
    for (const id of fileStates.current.keys()) if (!sessions[id]) fileStates.current.delete(id)
  }, [sessions])
  const activePane = workspace.panes.find((p) => p.id === workspace.focused) || workspace.panes[0]
  const activeSession = activePane.active ? sessions[activePane.active] : undefined
  function resize(e: React.PointerEvent, divider: (typeof geometry.splits)[number]) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const element = e.currentTarget as HTMLElement
    const bounds = gridRef.current!.getBoundingClientRect()
    const { axis, bounds: area, id } = divider
    const move = (event: PointerEvent) => {
      const value =
        axis === 'x'
          ? ((event.clientX - bounds.left) / bounds.width - area.left) / area.width
          : ((event.clientY - bounds.top) / bounds.height - area.top) / area.height
      onResize(id, value)
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
        <span className="workspace-drag-tip">拖到边缘分屏，拖到中间合并会话</span>
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
                key={activeSession?.id || 'empty'}
                stateCache={fileStates.current}
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
        <div className={`terminal-grid layout-${workspace.layout}`} ref={gridRef}>
          {workspace.panes.map((p) => (
            <TerminalPane
              key={p.id}
              pane={p}
              focused={workspace.focused === p.id}
              sessions={sessions}
              pool={pool}
              copyOnSelect={appearance.copyOnSelect === true}
              onCopyOnSelect={(enabled) => onAppearance({ copyOnSelect: enabled })}
              onFocus={(id) => onFocus(p.id, id)}
              onClose={onClose}
              onAdd={() => onAdd(p.id)}
              onMove={(id, before) => onMove(id, p.id, before)}
              onDock={(id, side) => onDock(id, p.id, side)}
              onDragSession={setDraggedSession}
              draggedSession={draggedSession}
              bounds={geometry.panes.get(p.id)!}
              onReconnect={onReconnect}
            />
          ))}
          {geometry.splits.map((divider) => (
            <div
              key={divider.id}
              className={`grid-resizer ${divider.axis === 'x' ? 'vertical' : 'horizontal'}`}
              role="separator"
              aria-label={divider.axis === 'x' ? '调整左右面板' : '调整上下面板'}
              style={
                divider.axis === 'x'
                  ? {
                      left: `${(divider.bounds.left + divider.bounds.width * divider.ratio) * 100}%`,
                      top: `${divider.bounds.top * 100}%`,
                      height: `${divider.bounds.height * 100}%`,
                      bottom: 'auto'
                    }
                  : {
                      top: `${(divider.bounds.top + divider.bounds.height * divider.ratio) * 100}%`,
                      left: `${divider.bounds.left * 100}%`,
                      width: `${divider.bounds.width * 100}%`,
                      right: 'auto'
                    }
              }
              onPointerDown={(e) => resize(e, divider)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
