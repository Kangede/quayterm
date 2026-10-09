import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Checkbox, Dropdown, Input, Modal, Progress, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CodeOutlined,
  DesktopOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  MenuOutlined,
  MinusOutlined,
  PlusOutlined,
  SearchOutlined,
  SwapOutlined,
  ExpandOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { FingerprintOutlined } from './components/Icons'
import { HostIcon, HostManager } from './components/HostManager'
import {
  FileEditor,
  FilePane,
  formatSize,
  type FileOpen,
  type TransferRequest,
  type FileClipboard
} from './components/Files'
import { TerminalWorkspace } from './components/TerminalWorkspace'
import { Terminals } from './lib/terminals'
import { addTab, changeLayout, initialWorkspace, moveTab, removeTab } from './lib/workspace'
import type { Host, HostDraft, KnownHost, Session, Settings, Transfer, Verification } from './types'
type View = 'hosts' | 'sftp' | 'terminal' | 'new'
type ConnectOptions = { pane?: string; side?: 'left' | 'right'; sftpOnly?: boolean }
export default function App() {
  const { modal, message } = AntApp.useApp()
  const [hosts, setHosts] = useState<Host[]>([])
  const [knownHosts, setKnownHosts] = useState<KnownHost[]>([])
  const [settings, setSettings] = useState<Settings>({ sidebar: true })
  const [platform, setPlatform] = useState('linux')
  const [version, setVersion] = useState('')
  const [secureStorage, setSecureStorage] = useState(false)
  const [view, setView] = useState<View>('hosts')
  const [page, setPage] = useState<'hosts' | 'known'>('hosts')
  const [navHidden, setNavHidden] = useState(false)
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  const [pool] = useState(() => new Terminals())
  const [verification, setVerification] = useState<Verification[]>([])
  const [auth, setAuth] = useState<{ host: Host; options: ConnectOptions } | null>(null)
  const [password, setPassword] = useState('')
  const [newQuery, setNewQuery] = useState('')
  const [targetPane, setTargetPane] = useState<string>()
  const [newHost, setNewHost] = useState(0)
  const [endpoints, setEndpoints] = useState<{ left: string | null; right: string | null }>({
    left: 'local',
    right: null
  })
  const [sftpVisited, setSftpVisited] = useState(false)
  const [locations, setLocations] = useState({ left: '', right: '' })
  const [fileClipboard, setFileClipboard] = useState<FileClipboard | null>(null)
  const availableClipboard =
    fileClipboard && (fileClipboard.source === 'local' || sessions[fileClipboard.source]?.state === 'ready')
      ? fileClipboard
      : null
  const [openFile, setOpenFile] = useState<FileOpen | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [showTransfers, setShowTransfers] = useState(false)
  const [transferRequest, setTransferRequest] = useState<TransferRequest | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [fatal, setFatal] = useState('')
  const [ready, setReady] = useState(false)
  const [about, setAbout] = useState(false)
  const current = useRef({ workspace, sessions, view, hosts, settings, endpoints })
  current.current = { workspace, sessions, view, hosts, settings, endpoints }
  const quitPending = useRef(false)
  useEffect(() => {
    if (!window.quay) {
      setFatal('请在 QuayTerm 桌面应用中打开此界面。')
      return
    }
    window.quay
      .invoke('bootstrap')
      .then((data) => {
        setHosts(data.hosts)
        setKnownHosts(data.knownHosts)
        setSettings({ sidebar: true, ...data.settings })
        setPlatform(data.platform)
        setVersion(data.version)
        setSecureStorage(data.secureStorage)
        pool.resizeFont(data.settings.fontSize || 14)
        pool.configure(data.settings)
        setReady(true)
      })
      .catch((e) => setFatal(e.message))
    pool.onClipboardError = (text) => {
      message.error(text)
    }
    pool.onPaste = (text, accept) => {
      if (/[\r\n]/.test(text))
        modal.confirm({
          title: '粘贴多行内容到终端？',
          content: (
            <>
              <p>远程程序可能将换行作为执行命令。</p>
              <pre className="paste-preview">{text.slice(0, 2000)}</pre>
            </>
          ),
          okText: '粘贴',
          onOk: accept
        })
      else accept()
    }
    const unsubscribe = window.quay.onEvent((event) => {
      if (event.type === 'terminal-data') pool.data(event.id, event.data, event.bytes)
      else if (event.type === 'session-status') {
        setSessions((old) =>
          old[event.id]
            ? { ...old, [event.id]: { ...old[event.id], state: event.state, message: event.message } }
            : old
        )
        if (['ready', 'closed', 'error'].includes(event.state))
          setVerification((v) => v.filter((c) => c.id !== event.id))
        if (event.state === 'ready') {
          void refreshKnown()
          setHosts((h) =>
            h.map((host) =>
              current.current.sessions[event.id]?.host.id === host.id
                ? { ...host, lastConnectedAt: Date.now() }
                : host
            )
          )
        }
      } else if (event.type === 'host-verification')
        setVerification((v) => [...v, event as unknown as Verification])
      else if (event.type === 'transfer') {
        setTransfers((t) => [...t.filter((x) => x.id !== event.id), event as unknown as Transfer].slice(-100))
        if (['done', 'canceled', 'error'].includes(event.state)) setRefreshToken((v) => v + 1)
      } else if (event.type === 'quit-request' && !quitPending.current) {
        quitPending.current = true
        modal.confirm({
          title: '关闭 QuayTerm？',
          content: '当前连接将断开，未完成的传输将被取消。',
          okText: '关闭应用',
          onOk: () => window.quay.invoke('quit'),
          onCancel: () => {
            quitPending.current = false
          }
        })
      }
    })
    // Native Edit menu accelerators serve ordinary inputs. The terminal owns
    // its clipboard shortcuts so bracketed/multiline paste keeps working.
    const focusChanged = (event: FocusEvent) => {
      const target = event.type === 'focusout' ? event.relatedTarget : event.target
      window.quay.terminal('focus', {
        active: target instanceof Element && Boolean(target.closest('.xterm, .file-rows'))
      })
    }
    document.addEventListener('focusin', focusChanged)
    document.addEventListener('focusout', focusChanged)
    return () => {
      unsubscribe()
      document.removeEventListener('focusin', focusChanged)
      document.removeEventListener('focusout', focusChanged)
      pool.dispose()
    }
  }, [])
  async function refreshKnown() {
    try {
      setKnownHosts(await window.quay.invoke('knownList'))
    } catch {}
  }
  async function saveHost(draft: HostDraft) {
    const host = await window.quay.invoke<Host>('hostSave', draft)
    setHosts((old) => [...old.filter((h) => h.id !== host.id), host])
    return host
  }
  async function deleteHost(id: string) {
    try {
      await window.quay.invoke('hostDelete', { id })
      setHosts((h) => h.filter((x) => x.id !== id))
    } catch (e: any) {
      message.error(e.message)
    }
  }
  function updateSettings(change: Settings) {
    setSettings((s) => ({ ...s, ...change }))
    void window.quay.invoke('settings', change).catch((e) => message.error(e.message))
    if (change.fontSize) pool.resizeFont(change.fontSize)
    pool.configure(change)
  }
  function start(host: Host, options: ConnectOptions = {}, suppliedPassword?: string) {
    if (!host.hasPassword && suppliedPassword === undefined) {
      setAuth({ host, options })
      setPassword('')
      return
    }
    const id = crypto.randomUUID()
    if (!options.sftpOnly) {
      pool.create(id, host)
      setWorkspace((w) => addTab(w, id, options.pane))
      setView('terminal')
    }
    setSessions((s) => ({
      ...s,
      [id]: { id, host, state: 'connecting', message: '正在连接 SSH 服务…', sftpOnly: options.sftpOnly }
    }))
    if (options.side) replaceEndpoint(options.side, id)
    void window.quay
      .invoke('sessionStart', {
        id,
        hostId: host.id,
        password: suppliedPassword,
        cols: 100,
        rows: 30,
        sftpOnly: options.sftpOnly
      })
      .catch((e) =>
        setSessions((s) => (s[id] ? { ...s, [id]: { ...s[id], state: 'error', message: e.message } } : s))
      )
  }
  function replaceEndpoint(side: 'left' | 'right', id: string) {
    const old = current.current.endpoints[side]
    const other = current.current.endpoints[side === 'left' ? 'right' : 'left']
    if (old && old !== 'local' && old !== other && current.current.sessions[old]?.sftpOnly) disconnect(old)
    setEndpoints((e) => ({ ...e, [side]: id }))
    setLocations((p) => ({ ...p, [side]: '' }))
  }
  function disconnect(id: string) {
    void window.quay.invoke('sessionClose', { id })
    pool.close(id)
    setWorkspace((w) => removeTab(w, id))
    setSessions((s) => {
      const next = { ...s }
      delete next[id]
      return next
    })
    setVerification((v) => v.filter((c) => c.id !== id))
  }
  function closeSession(id: string) {
    const s = current.current.sessions[id]
    if (!s) return
    if (s.state === 'ready')
      modal.confirm({
        title: `断开 ${s.host.name}？`,
        content: '当前 SSH 会话将关闭。',
        okText: '断开',
        onOk: () => disconnect(id)
      })
    else disconnect(id)
  }
  function reconnect(id: string) {
    const s = current.current.sessions[id]
    const p = current.current.workspace.panes.find((p) => p.tabs.includes(id))
    if (!s) return
    disconnect(id)
    start(s.host, { pane: p?.id })
  }
  function newConnection(pane?: string) {
    setTargetPane(pane || current.current.workspace.focused)
    setNewQuery('')
    setView('new')
  }
  function focus(pane: string, id: string) {
    setWorkspace((w) => ({
      ...w,
      focused: pane,
      panes: w.panes.map((p) => (p.id === pane ? { ...p, active: id } : p))
    }))
  }
  function requestTransfer(request: TransferRequest) {
    setTransferRequest(request)
    setOverwrite(false)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const state = current.current
      const command = e.ctrlKey || e.metaKey
      if (!command && !(e.altKey && /^[1-9]$/.test(e.key))) return
      // Dialogs and file editors own their shortcuts and must not lose unsaved work.
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return
      if (command && e.shiftKey && ['t', 'k'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        newConnection()
      } else if (command && e.key.toLowerCase() === 'k' && !e.shiftKey && state.view !== 'terminal') {
        e.preventDefault()
        newConnection()
      } else if (command && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        updateSettings({ sidebar: !state.settings.sidebar })
      } else if (state.view === 'terminal') {
        const pane = state.workspace.panes.find((p) => p.id === state.workspace.focused)!
        if (command && e.shiftKey && e.key.toLowerCase() === 'w' && pane.active) {
          e.preventDefault()
          closeSession(pane.active)
        } else if (e.ctrlKey && e.key === 'Tab' && pane.tabs.length) {
          e.preventDefault()
          const index = pane.tabs.indexOf(pane.active!)
          focus(pane.id, pane.tabs[(index + (e.shiftKey ? pane.tabs.length - 1 : 1)) % pane.tabs.length])
        } else if (e.altKey && /^[1-9]$/.test(e.key) && pane.tabs[Number(e.key) - 1]) {
          e.preventDefault()
          focus(pane.id, pane.tabs[Number(e.key) - 1])
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const terminalCount = workspace.panes.reduce((sum, p) => sum + p.tabs.length, 0)
  const activePane = workspace.panes.find((p) => p.id === workspace.focused)
  const activeSession = activePane?.active ? sessions[activePane.active] : null
  const activeTransfers = transfers.filter((t) => ['running', 'preparing', 'queued'].includes(t.state)).length
  const recent = [...hosts]
    .filter((h) => `${h.name} ${h.address} ${h.username}`.toLowerCase().includes(newQuery.toLowerCase()))
    .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt || b.createdAt - a.createdAt)
  if (fatal)
    return (
      <div className="fatal">
        <h2>QuayTerm</h2>
        <p>{fatal}</p>
      </div>
    )
  if (!ready)
    return (
      <div className="boot">
        <LoadingOutlined /> 正在开启 QuayTerm…
      </div>
    )
  return (
    <div className={`app-shell ${view === 'terminal' ? 'terminal-mode' : ''}`}>
      <header className="titlebar">
        {platform === 'darwin' && <span className="mac-controls-space" />}
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'nav', label: navHidden ? '显示导航栏' : '收起导航栏' },
              { key: 'new', label: '新建连接', extra: 'Ctrl+Shift+T' },
              { type: 'divider' },
              { key: 'font-up', label: '增大终端字号' },
              { key: 'font-down', label: '减小终端字号' },
              { key: 'font-reset', label: '重置终端字号' },
              { type: 'divider' },
              { key: 'about', label: '关于与快捷键' }
            ],
            onClick: (e) => {
              if (e.key === 'nav') setNavHidden(!navHidden)
              else if (e.key === 'new') newConnection()
              else if (e.key === 'about') setAbout(true)
              else
                updateSettings({
                  fontSize:
                    e.key === 'font-reset'
                      ? 14
                      : Math.max(10, Math.min(26, (settings.fontSize || 14) + (e.key === 'font-up' ? 1 : -1)))
                })
            }
          }}
        >
          <Button type="text" aria-label="主菜单" icon={<MenuOutlined />} />
        </Dropdown>
        <div className="brand-mark" title="QuayTerm · 泊岸">
          <span>q</span>
        </div>
        <button
          aria-label="主机"
          className={`main-tab ${view === 'hosts' ? 'active' : ''}`}
          onClick={() => setView('hosts')}
        >
          <DesktopOutlined />
          <span>主机</span>
        </button>
        <button
          aria-label="SFTP"
          className={`main-tab ${view === 'sftp' ? 'active' : ''}`}
          onClick={() => {
            setView('sftp')
            setSftpVisited(true)
          }}
        >
          <FolderOutlined />
          <span>SFTP</span>
        </button>
        {terminalCount > 0 && (
          <button
            className={`main-tab workspace-tab ${view === 'terminal' ? 'active' : ''}`}
            onClick={() => setView('terminal')}
          >
            <span className="status-dot" />
            <span>{activeSession?.host.name || '终端工作区'}</span>
            <small>{terminalCount}</small>
          </button>
        )}
        {view === 'new' && (
          <button className="main-tab active">
            <PlusOutlined />
            <span>新标签</span>
            <CloseOutlined onClick={() => setView(terminalCount ? 'terminal' : 'hosts')} />
          </button>
        )}
        <Tooltip title="新建连接 · Ctrl+Shift+T">
          <Button type="text" aria-label="新建连接" icon={<PlusOutlined />} onClick={() => newConnection()} />
        </Tooltip>
        <span className="titlebar-drag">
          <span>QUAYTERM</span>
        </span>
        {platform !== 'darwin' && (
          <div className="window-controls">
            <button
              aria-label="最小化"
              onClick={() => window.quay.invoke('windowControl', { action: 'minimize' })}
            >
              <MinusOutlined />
            </button>
            <button
              aria-label="最大化"
              onClick={() => window.quay.invoke('windowControl', { action: 'maximize' })}
            >
              <ExpandOutlined />
            </button>
            <button
              aria-label="关闭窗口"
              onClick={() => window.quay.invoke('windowControl', { action: 'close' })}
            >
              <CloseOutlined />
            </button>
          </div>
        )}
      </header>
      <main className="main-body">
        <div className={`host-screen ${view !== 'hosts' ? 'hidden-screen' : ''}`}>
          {!navHidden && (
            <aside className="navigation">
              <div className="nav-brand">
                <b>QuayTerm</b>
                <span>泊岸 · 你的远程工作区</span>
              </div>
              <button
                aria-label="远程主机"
                className={page === 'hosts' ? 'active' : ''}
                onClick={() => setPage('hosts')}
              >
                <DesktopOutlined />
                远程主机
              </button>
              <button
                aria-label="已知主机"
                className={page === 'known' ? 'active' : ''}
                onClick={() => {
                  setPage('known')
                  void refreshKnown()
                }}
              >
                <FingerprintOutlined />
                已知主机
              </button>
              <span className="toolbar-spacer" />
              <div className="nav-footer">
                <span>Q</span>
                <div>
                  <b>本地工作区</b>
                  <small>只属于这台设备</small>
                </div>
                <Tooltip title="关于与快捷键">
                  <Button
                    type="text"
                    size="small"
                    icon={<InfoCircleOutlined />}
                    aria-label="关于与快捷键"
                    onClick={() => setAbout(true)}
                  />
                </Tooltip>
              </div>
            </aside>
          )}
          <HostManager
            hosts={hosts}
            knownHosts={knownHosts}
            page={page}
            settings={settings}
            secureStorage={secureStorage}
            onSave={saveHost}
            onDelete={deleteHost}
            onConnect={(h) => start(h)}
            onSettings={updateSettings}
            onRefreshKnown={refreshKnown}
            openNew={newHost}
          />
        </div>
        <div className={`terminal-screen ${view !== 'terminal' ? 'hidden-screen' : ''}`}>
          <TerminalWorkspace
            workspace={workspace}
            sessions={sessions}
            hosts={hosts}
            pool={pool}
            fileClipboard={availableClipboard}
            onCopyFiles={setFileClipboard}
            appearance={settings}
            onAppearance={updateSettings}
            sidebar={settings.sidebar !== false}
            onSidebar={() => updateSettings({ sidebar: !settings.sidebar })}
            onLayout={(id) => setWorkspace((w) => changeLayout(w, id))}
            onFocus={focus}
            onClose={closeSession}
            onAdd={newConnection}
            onMove={(id, pane, before) => setWorkspace((w) => moveTab(w, id, pane, before))}
            onReconnect={reconnect}
            onOpenFile={setOpenFile}
            onTransfer={requestTransfer}
            refreshToken={refreshToken}
          />
        </div>
        {sftpVisited && (
          <div className={`sftp-screen ${view !== 'sftp' ? 'hidden-screen' : ''}`}>
            <FilePane
              clipboard={availableClipboard}
              onCopy={setFileClipboard}
              transferTarget={
                endpoints.right &&
                locations.right &&
                (endpoints.right === 'local' || sessions[endpoints.right]?.state === 'ready')
                  ? { endpoint: endpoints.right, directory: locations.right }
                  : null
              }
              endpoint={endpoints.left}
              session={sessions[endpoints.left || '']}
              hosts={hosts}
              onSelect={(h) =>
                h === 'local' ? replaceEndpoint('left', 'local') : start(h, { sftpOnly: true, side: 'left' })
              }
              onOpen={setOpenFile}
              onTransfer={requestTransfer}
              onLocation={(left) => setLocations((p) => ({ ...p, left }))}
              refreshToken={refreshToken}
            />
            <div className="sftp-divider">
              <SwapOutlined />
            </div>
            <FilePane
              clipboard={availableClipboard}
              onCopy={setFileClipboard}
              transferTarget={
                endpoints.left &&
                locations.left &&
                (endpoints.left === 'local' || sessions[endpoints.left]?.state === 'ready')
                  ? { endpoint: endpoints.left, directory: locations.left }
                  : null
              }
              endpoint={endpoints.right}
              session={sessions[endpoints.right || '']}
              hosts={hosts}
              onSelect={(h) =>
                h === 'local'
                  ? replaceEndpoint('right', 'local')
                  : start(h, { sftpOnly: true, side: 'right' })
              }
              onOpen={setOpenFile}
              onTransfer={requestTransfer}
              onLocation={(right) => setLocations((p) => ({ ...p, right }))}
              refreshToken={refreshToken}
            />
          </div>
        )}
        {view === 'new' && (
          <div className="new-screen">
            <div className="new-connection">
              <div className="new-heading">
                <span className="new-icon">
                  <CodeOutlined />
                </span>
                <h1>下一站，连接哪里？</h1>
                <p>选择主机，在当前面板中开启一个独立会话。</p>
              </div>
              <Input
                autoFocus
                prefix={<SearchOutlined />}
                size="large"
                placeholder="搜索主机"
                aria-label="搜索连接主机"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                onPressEnter={() => {
                  if (recent[0]) start(recent[0], { pane: targetPane })
                }}
                suffix={<kbd>Ctrl K</kbd>}
              />
              <div className="recent-hosts">
                <header>
                  <b>最近的连接</b>
                  <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setView('hosts')
                      setPage('hosts')
                      setNewHost((n) => n + 1)
                    }}
                  >
                    添加主机
                  </Button>
                </header>
                {recent.map((h) => (
                  <button key={h.id} onClick={() => start(h, { pane: targetPane })}>
                    <HostIcon host={h} small />
                    <span>{h.name}</span>
                    <small>
                      {h.username}@{h.address}
                    </small>
                    <ArrowRightOutlined />
                  </button>
                ))}
                {!recent.length && <p className="muted">没有匹配的主机。先添加一台主机。</p>}
              </div>
            </div>
          </div>
        )}
      </main>
      {(view === 'sftp' || transfers.length > 0) && (
        <div className="transfer-bar">
          <button onClick={() => setShowTransfers((v) => !v)}>
            <SwapOutlined />
            传输队列{' '}
            <span>{activeTransfers > 0 ? `${activeTransfers} 项进行中` : `${transfers.length} 项`}</span>
          </button>
          <span className="toolbar-spacer" />
          {view === 'sftp' && <small>拖动文件到另一侧开始传输 · 双击文本文件编辑</small>}
        </div>
      )}
      {showTransfers && (
        <div className="transfer-panel">
          <header>
            <h3>传输队列</h3>
            <Button
              type="text"
              onClick={() =>
                setTransfers((t) => t.filter((x) => ['running', 'queued', 'preparing'].includes(x.state)))
              }
            >
              清除已完成
            </Button>
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="关闭传输队列"
              onClick={() => setShowTransfers(false)}
            />
          </header>
          {transfers.length ? (
            [...transfers].reverse().map((t) => (
              <div className="transfer-item" key={t.id}>
                <div>
                  <b>{t.name}</b>
                  <span>
                    {
                      (
                        {
                          done: '已完成',
                          error: '失败',
                          canceled: '已取消',
                          running: '正在传输',
                          queued: '等待中',
                          preparing: '正在检查文件'
                        } as Record<string, string>
                      )[t.state]
                    }
                  </span>
                </div>
                <Progress
                  percent={
                    t.state === 'done'
                      ? 100
                      : t.total
                        ? Math.min(99, Math.round((t.transferred / t.total) * 100))
                        : 0
                  }
                  size="small"
                  status={t.state === 'error' ? 'exception' : t.state === 'done' ? 'success' : 'active'}
                />
                <small>
                  {formatSize(t.transferred)} / {formatSize(t.total)} {t.message}
                </small>
                {['queued', 'running', 'preparing'].includes(t.state) && (
                  <Button size="small" onClick={() => window.quay.invoke('transferCancel', { id: t.id })}>
                    取消
                  </Button>
                )}
              </div>
            ))
          ) : (
            <div className="file-empty">暂无传输任务</div>
          )}
        </div>
      )}
      <Modal
        title="确认 SSH 主机指纹"
        open={verification.length > 0}
        closable={false}
        maskClosable={false}
        okText="信任并连接"
        cancelText="取消连接"
        onOk={async () => {
          const item = verification[0]
          setVerification((v) => v.slice(1))
          await window.quay.invoke('hostVerify', { challengeId: item.challengeId, accept: true })
          await refreshKnown()
        }}
        onCancel={async () => {
          const item = verification[0]
          setVerification((v) => v.slice(1))
          await window.quay.invoke('hostVerify', { challengeId: item.challengeId, accept: false })
        }}
      >
        <div className="verify-content">
          <div className="verify-symbol">
            <FingerprintOutlined />
          </div>
          <h3>{verification[0]?.name}</h3>
          <p>首次连接 {verification[0]?.label}。请核对主机指纹。</p>
          <code>{verification[0]?.fingerprint}</code>
          <small>{verification[0]?.algorithm}</small>
        </div>
      </Modal>
      <Modal
        title={`连接 ${auth?.host.name || ''}`}
        open={!!auth}
        okText="连接"
        cancelText="取消"
        onCancel={() => setAuth(null)}
        onOk={() => {
          if (auth) start(auth.host, auth.options, password)
          setAuth(null)
          setPassword('')
        }}
      >
        <p>输入 {auth?.host.username} 的密码，用于本次连接。</p>
        <Input.Password
          autoFocus
          aria-label="连接密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={() => {
            if (auth) start(auth.host, auth.options, password)
            setAuth(null)
            setPassword('')
          }}
        />
      </Modal>
      <Modal
        title="传输文件"
        open={!!transferRequest}
        okText="开始传输"
        cancelText="取消"
        onCancel={() => setTransferRequest(null)}
        onOk={async () => {
          try {
            await window.quay.invoke('transfer', { ...transferRequest, overwrite })
            setTransferRequest(null)
            setShowTransfers(true)
          } catch (e: any) {
            message.error(e.message)
          }
        }}
      >
        <p>
          复制 {transferRequest?.paths.length} 个项目到{' '}
          {transferRequest?.destination === 'local'
            ? '本地'
            : sessions[transferRequest?.destination || '']?.host.name || '目标主机'}
          ：
        </p>
        <pre className="path-preview">{transferRequest?.directory}</pre>
        <Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)}>
          允许覆盖目标中的同名文件
        </Checkbox>
        <p className="muted">默认保留目标中的同名文件；未勾选时遇到同名文件会停止本次传输并提示。</p>
      </Modal>
      {openFile && (
        <FileEditor
          key={`${openFile.endpoint}:${openFile.path}`}
          file={openFile}
          onClose={() => setOpenFile(null)}
          onSaved={() => setRefreshToken((t) => t + 1)}
        />
      )}
      <Modal
        title="QuayTerm · 泊岸"
        open={about}
        onCancel={() => setAbout(false)}
        footer={
          <Button type="primary" onClick={() => setAbout(false)}>
            知道了
          </Button>
        }
      >
        <p>SSH 与 SFTP，放在顺手的位置。版本 {version}</p>
        <div className="shortcut-list">
          {[
            ['新建连接', 'Ctrl / ⌘ Shift T'],
            ['连接选择器', 'Ctrl / ⌘ Shift K'],
            ['复制 / 粘贴', 'Ctrl Shift C / V · ⌘ C / V'],
            ['查找终端内容', 'Ctrl Shift F · ⌘ F'],
            ['关闭当前会话', 'Ctrl / ⌘ Shift W'],
            ['切换当前面板的会话', 'Ctrl Tab / Ctrl Shift Tab'],
            ['跳至面板中的会话', 'Alt 1…9'],
            ['显示 / 隐藏文件侧栏', 'Ctrl / ⌘ Shift B'],
            ['保存文件', 'Ctrl / ⌘ S'],
            ['重命名文件', 'F2']
          ].map(([label, key]) => (
            <div key={label}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
        <p className="field-hint">
          Ctrl+A、Ctrl+B、Ctrl+C、Ctrl+D、Ctrl+Z 等按键会原样传递给远端终端。文件传输使用
          SFTP；文件浏览不会执行远端 shell 命令。
        </p>
      </Modal>
    </div>
  )
}
