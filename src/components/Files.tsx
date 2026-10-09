import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Checkbox, Dropdown, Input, Modal, Select, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseOutlined,
  DownOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
  LinkOutlined,
  EyeOutlined,
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  ExportOutlined
} from '@ant-design/icons'
import type { FileEntry, FileList, Host, Session } from '../types'
import { HostIcon } from './HostManager'
export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KiB`
  if (size < 1073741824) return `${(size / 1048576).toFixed(1)} MiB`
  return `${(size / 1073741824).toFixed(1)} GiB`
}
export type FileOpen = { endpoint: string; path: string; name: string; editOnly?: boolean }
export type TransferRequest = { source: string; destination: string; paths: string[]; directory: string }
export type FileClipboard = { source: string; paths: string[] }
export type TransferTarget = { endpoint: string; directory: string }
type FileContext = { x: number; y: number; entry?: FileEntry; paths: string[]; directory: string }
async function openLocalFile(file: FileOpen, message: ReturnType<typeof App.useApp>['message']) {
  const hide = message.loading(
    file.endpoint === 'local' ? `正在打开 ${file.name}…` : `正在下载并打开 ${file.name}…`,
    0
  )
  try {
    const result = await window.quay.invoke<{ path: string; temporary: boolean }>('fileOpenLocal', file)
    if (result.temporary)
      message.info('已用本地程序打开临时副本。修改不会自动上传到远端，需要保留时请另存。', 7)
  } finally {
    hide()
  }
}
export function EndpointPicker({
  hosts,
  onSelect,
  onCancel
}: {
  hosts: Host[]
  onSelect: (host: Host | 'local') => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  return (
    <div className="endpoint-picker">
      <header>
        <Button type="text" icon={<ArrowLeftOutlined />} aria-label="返回文件列表" onClick={onCancel} />
        <b>选择主机</b>
        <span className="toolbar-spacer" />
        <Button aria-label="本地" size="small" icon={<HomeOutlined />} onClick={() => onSelect('local')}>
          本地
        </Button>
      </header>
      <div className="picker-search">
        <Input
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="搜索主机"
          aria-label="搜索文件主机"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <h3>主机</h3>
      <div className="endpoint-hosts">
        {hosts
          .filter((h) => `${h.name} ${h.address}`.toLowerCase().includes(query.toLowerCase()))
          .map((h) => (
            <button className="endpoint-host" key={h.id} onClick={() => onSelect(h)}>
              <HostIcon host={h} />
              <span>
                <b>{h.name}</b>
                <small>ssh, {h.username}</small>
              </span>
              <ArrowRightOutlined />
            </button>
          ))}
        {!hosts.length && <p className="muted">先在“远程主机”中添加主机。</p>}
      </div>
    </div>
  )
}
export function FilePane({
  endpoint,
  session,
  hosts,
  compact = false,
  onSelect,
  onOpen,
  onTransfer,
  clipboard,
  onCopy,
  transferTarget,
  onLocation,
  refreshToken,
  showHiddenDefault = false
}: {
  endpoint: string | null
  session?: Session
  hosts: Host[]
  compact?: boolean
  onSelect?: (host: Host | 'local') => void
  onOpen: (file: FileOpen) => void
  onTransfer?: (request: TransferRequest) => void
  clipboard?: FileClipboard | null
  onCopy?: (clipboard: FileClipboard) => void
  transferTarget?: TransferTarget | null
  onLocation?: (location: string) => void
  refreshToken?: number
  showHiddenDefault?: boolean
}) {
  const { modal, message } = App.useApp()
  const [choosing, setChoosing] = useState(false)
  const [list, setList] = useState<FileList | null>(null)
  const [pathInput, setPathInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [filtering, setFiltering] = useState(false)
  const [hidden, setHidden] = useState(showHiddenDefault)
  const [expanded, setExpanded] = useState<Record<string, FileEntry[]>>({})
  const [sort, setSort] = useState('name')
  const [operation, setOperation] = useState<{ action: string; name: string; path: string } | null>(null)
  const [opBusy, setOpBusy] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [context, setContext] = useState<FileContext | null>(null)
  const generation = useRef(0)
  const current = useRef(list)
  current.current = list
  const canLoad = endpoint === 'local' || session?.state === 'ready'
  async function load(p?: string, remember = true) {
    if (!endpoint || !canLoad) return
    const gen = ++generation.current
    setBusy(true)
    setError('')
    try {
      const result = await window.quay.invoke<FileList>('filesList', { endpoint, path: p })
      if (gen !== generation.current) return
      if (remember && current.current && current.current.path !== result.path)
        setHistory((h) => [...h, current.current!.path])
      setList(result)
      setPathInput(result.path)
      setSelected([])
      setExpanded({})
      onLocation?.(result.path)
    } catch (e: any) {
      if (gen === generation.current) setError(e.message)
    } finally {
      if (gen === generation.current) setBusy(false)
    }
  }
  useEffect(() => {
    generation.current++
    setList(null)
    setPathInput('')
    setContext(null)
    current.current = null
    setHistory([])
    setSelected([])
    setExpanded({})
    setChoosing(false)
    setError('')
    if (canLoad) void load(undefined, false)
    return () => {
      generation.current++
    }
  }, [endpoint, canLoad])
  useEffect(() => {
    if (refreshToken && current.current) void load(current.current.path, false)
  }, [refreshToken])
  useEffect(() => {
    if (!context) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContext(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [context])
  const visible = useMemo(
    () =>
      (list?.entries || [])
        .filter(
          (e) => (hidden || !e.name.startsWith('.')) && e.name.toLowerCase().includes(filter.toLowerCase())
        )
        .sort(
          (a, b) =>
            Number(b.isDirectory) - Number(a.isDirectory) ||
            (sort === 'size'
              ? b.size - a.size
              : sort === 'date'
                ? b.modified - a.modified
                : a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
        ),
    [list, hidden, filter, sort]
  )
  function pick(e: FileEntry, event: React.MouseEvent) {
    if (event.shiftKey && selected.length) {
      const i = visible.findIndex((f) => f.path === selected[0])
      const j = visible.findIndex((f) => f.path === e.path)
      setSelected(visible.slice(Math.min(i, j), Math.max(i, j) + 1).map((f) => f.path))
    } else if (event.ctrlKey || event.metaKey)
      setSelected((s) => (s.includes(e.path) ? s.filter((p) => p !== e.path) : [...s, e.path]))
    else setSelected([e.path])
  }
  function open(e: FileEntry, editOnly = false) {
    if (e.isDirectory) void load(e.path)
    else if (endpoint) onOpen({ endpoint, path: e.path, name: e.name, editOnly })
  }
  async function expand(e: FileEntry) {
    if (expanded[e.path]) {
      setExpanded((old) => {
        const copy = { ...old }
        delete copy[e.path]
        return copy
      })
      return
    }
    try {
      const next = await window.quay.invoke<FileList>('filesList', { endpoint, path: e.path })
      setExpanded((old) => ({ ...old, [e.path]: next.entries }))
    } catch (e: any) {
      message.error(e.message)
    }
  }
  function remove(paths = selected) {
    if (!paths.length) return
    modal.confirm({
      title: `删除 ${paths.length} 个项目？`,
      content: (
        <>
          <p>此操作会永久删除所选文件或文件夹及其内容。</p>
          <pre className="path-preview">{paths.join('\n')}</pre>
        </>
      ),
      okText: '永久删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          for (const p of paths)
            await window.quay.invoke('fileOperation', { endpoint, path: p, action: 'delete' })
          await load(list?.path, false)
        } catch (e: any) {
          message.error(e.message)
          await load(list?.path, false)
        }
      }
    })
  }
  const entryAt = (p: string) =>
    [...(list?.entries || []), ...Object.values(expanded).flat()].find((entry) => entry.path === p)
  function showContext(entry: FileEntry | undefined, x: number, y: number) {
    if (!list || !canLoad) return
    const paths = entry ? (selected.includes(entry.path) ? selected : [entry.path]) : []
    setSelected(paths)
    setContext({ x, y, entry, paths, directory: entry?.isDirectory ? entry.path : list.path })
  }
  async function action(key: string, target?: FileContext) {
    const paths = target?.paths || selected
    const entry = target?.entry || entryAt(paths[0])
    const directory = target?.directory || list?.path
    try {
      if (key === 'refresh') await load(list?.path, false)
      else if (key === 'hidden') setHidden(!hidden)
      else if (key === 'open' && entry && paths.length === 1) open(entry, true)
      else if (key === 'open-local' && entry && paths.length === 1 && endpoint && !entry.isDirectory)
        await openLocalFile({ endpoint, path: entry.path, name: entry.name }, message)
      else if ((key === 'mkdir' || key === 'create') && directory)
        setOperation({ action: key, path: directory, name: '' })
      else if (key === 'rename' && paths.length === 1)
        setOperation({ action: key, path: paths[0], name: entry?.name || paths[0].split(/[/\\]/).pop()! })
      else if (key === 'delete') remove(paths)
      else if (key === 'copy-path')
        await window.quay.invoke('clipboardWrite', {
          text: paths.length ? paths.join('\n') : directory || ''
        })
      else if (key === 'copy-name')
        await window.quay.invoke('clipboardWrite', {
          text: paths.map((p) => entryAt(p)?.name || p.split(/[/\\]/).pop()).join('\n')
        })
      else if (key === 'copy' && paths.length && endpoint) {
        onCopy?.({ source: endpoint, paths: [...paths] })
        message.success(`已复制 ${paths.length} 个项目，可在目标文件夹粘贴`)
      } else if (key === 'paste' && clipboard && endpoint && directory)
        onTransfer?.({ ...clipboard, destination: endpoint, directory })
      else if (key === 'transfer' && paths.length && endpoint && transferTarget)
        onTransfer?.({
          source: endpoint,
          destination: transferTarget.endpoint,
          paths,
          directory: transferTarget.directory
        })
      else if (key === 'download' && paths.length && endpoint) {
        const folder = await window.quay.invoke<string | null>('chooseDownloadDirectory')
        if (folder) onTransfer?.({ source: endpoint, destination: 'local', paths, directory: folder })
      } else if ((key === 'upload' || key === 'upload-folder') && endpoint && directory) {
        const paths = await window.quay.invoke<string[]>('chooseUploadPaths', {
          folder: key === 'upload-folder'
        })
        if (paths.length) onTransfer?.({ source: 'local', destination: endpoint, paths, directory })
      } else if (key === 'reveal' && paths.length === 1 && endpoint === 'local')
        await window.quay.invoke('fileReveal', { path: paths[0] })
      else if (key === 'properties' && entry && paths.length === 1)
        modal.info({
          title: entry.name,
          width: 570,
          content: (
            <dl className="file-properties">
              <dt>路径</dt>
              <dd>{entry.path}</dd>
              <dt>类型</dt>
              <dd>{entry.isSymlink ? '符号链接' : entry.isDirectory ? '文件夹' : '文件'}</dd>
              <dt>大小</dt>
              <dd>{entry.isDirectory ? '—' : `${formatSize(entry.size)}（${entry.size} 字节）`}</dd>
              <dt>修改时间</dt>
              <dd>{entry.modified ? new Date(entry.modified).toLocaleString() : '—'}</dd>
              <dt>权限</dt>
              <dd>{(entry.mode & 0o777).toString(8).padStart(3, '0')}</dd>
            </dl>
          )
        })
    } catch (e: any) {
      message.error(e.message)
    }
  }
  const contextItems: MenuProps['items'] = context
    ? [
        ...(context.paths.length
          ? [
              {
                key: 'open',
                label: context.entry?.isDirectory ? '打开文件夹' : '编辑文件',
                icon: context.entry?.isDirectory ? <FolderOpenOutlined /> : <EditOutlined />,
                disabled: context.paths.length !== 1
              },
              ...(!context.entry?.isDirectory
                ? [
                    {
                      key: 'open-local',
                      label: '用本地程序打开',
                      icon: <ExportOutlined />,
                      disabled: context.paths.length !== 1 || context.entry?.inaccessible
                    }
                  ]
                : []),
              { key: 'copy', label: '复制文件', icon: <CopyOutlined />, disabled: !onCopy },
              { key: 'copy-name', label: '复制名称' },
              { key: 'copy-path', label: '复制路径' },
              ...(endpoint !== 'local'
                ? [{ key: 'download', label: '下载到本地…', icon: <DownloadOutlined /> }]
                : [{ key: 'reveal', label: '在系统文件管理器中显示', disabled: context.paths.length !== 1 }]),
              ...(transferTarget
                ? [{ key: 'transfer', label: '传输到另一侧', icon: <ArrowRightOutlined /> }]
                : []),
              { type: 'divider' as const },
              {
                key: 'rename',
                label: '重命名',
                icon: <EditOutlined />,
                disabled: context.paths.length !== 1
              },
              {
                key: 'delete',
                label: context.paths.length > 1 ? `删除 ${context.paths.length} 个项目` : '删除',
                icon: <DeleteOutlined />,
                danger: true
              },
              {
                key: 'properties',
                label: '属性',
                icon: <InfoCircleOutlined />,
                disabled: context.paths.length !== 1
              },
              { type: 'divider' as const }
            ]
          : []),
        ...(!context.entry || (context.entry.isDirectory && context.paths.length === 1)
          ? [
              { key: 'paste', label: '粘贴文件', disabled: !clipboard },
              { key: 'mkdir', label: '新建文件夹', icon: <FolderOutlined /> },
              { key: 'create', label: '新建文件', icon: <FileOutlined /> },
              ...(endpoint !== 'local'
                ? [
                    { key: 'upload', label: '上传文件…', icon: <UploadOutlined /> },
                    { key: 'upload-folder', label: '上传文件夹…' }
                  ]
                : []),
              { type: 'divider' as const }
            ]
          : []),
        { key: 'refresh', label: '刷新', icon: <ReloadOutlined /> },
        { key: 'hidden', label: <Checkbox checked={hidden}>显示隐藏文件</Checkbox> }
      ]
    : []
  function drop(event: React.DragEvent, directory = list?.path) {
    event.preventDefault()
    event.stopPropagation()
    if (!endpoint || !directory || !onTransfer) return
    try {
      const data = event.dataTransfer.getData('application/x-quay-files')
      if (data) {
        const payload = JSON.parse(data)
        onTransfer({ source: payload.endpoint, destination: endpoint, paths: payload.paths, directory })
      } else if (event.dataTransfer.files.length) {
        const paths = Array.from(event.dataTransfer.files)
          .map((f) => window.quay.filePath(f))
          .filter(Boolean)
        if (paths.length) onTransfer({ source: 'local', destination: endpoint, paths, directory })
      }
    } catch {
      message.error('无法读取拖放的文件')
    }
  }
  function row(entry: FileEntry, depth = 0): React.ReactNode {
    return (
      <div key={entry.path}>
        <div
          className={`file-row ${selected.includes(entry.path) ? 'selected' : ''} ${entry.inaccessible ? 'muted' : ''}`}
          role="row"
          tabIndex={0}
          data-path={entry.path}
          onClick={(e) => pick(entry, e)}
          onDoubleClick={() => open(entry)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            showContext(entry, e.clientX, e.clientY)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              open(entry)
            }
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault()
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              showContext(entry, rect.left + 40, rect.top + 20)
            }
          }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(
              'application/x-quay-files',
              JSON.stringify({ endpoint, paths: selected.includes(entry.path) ? selected : [entry.path] })
            )
            event.dataTransfer.effectAllowed = 'copy'
          }}
          onDragOver={(event) => {
            if (entry.isDirectory) {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => drop(event, entry.isDirectory ? entry.path : list?.path)}
        >
          <span className="file-name" style={compact ? { paddingLeft: 10 + depth * 16 } : {}}>
            {compact && entry.isDirectory ? (
              <button
                className="tree-toggle"
                aria-label={`展开 ${entry.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void expand(entry)
                }}
              >
                <DownOutlined style={{ transform: expanded[entry.path] ? undefined : 'rotate(-90deg)' }} />
              </button>
            ) : compact ? (
              <span className="tree-toggle-space" />
            ) : null}
            {entry.isDirectory ? (
              expanded[entry.path] ? (
                <FolderOpenOutlined className="folder-icon" />
              ) : (
                <FolderOutlined className="folder-icon" />
              )
            ) : entry.isSymlink ? (
              <LinkOutlined />
            ) : (
              <FileOutlined />
            )}
            <span title={entry.name}>{entry.name}</span>
            {entry.isSymlink && <small>↗</small>}
          </span>
          {!compact && (
            <>
              <span className="file-date">
                {entry.modified ? new Date(entry.modified).toLocaleString('zh-CN', { hour12: false }) : '—'}
              </span>
              <span className="file-size">{entry.isDirectory ? '—' : formatSize(entry.size)}</span>
              <span className="file-type">
                {entry.isSymlink
                  ? '链接'
                  : entry.isDirectory
                    ? '文件夹'
                    : entry.name.split('.').length > 1
                      ? entry.name.split('.').pop()
                      : '文件'}
              </span>
            </>
          )}
        </div>
        {compact &&
          expanded[entry.path]
            ?.filter((e) => hidden || !e.name.startsWith('.'))
            .map((e) => row(e, depth + 1))}
      </div>
    )
  }
  if (choosing && onSelect)
    return (
      <EndpointPicker
        hosts={hosts}
        onSelect={(h) => {
          setChoosing(false)
          onSelect(h)
        }}
        onCancel={() => setChoosing(false)}
      />
    )
  if (!endpoint)
    return (
      <div className="file-pane empty-pane">
        <div className="empty-state">
          <div className="empty-icon">
            <FolderOutlined />
          </div>
          <h2>{onSelect ? '连接到主机' : '会话文件'}</h2>
          <p>{onSelect ? '选择一台主机，浏览和传输文件。' : '连接会话后，这里会显示它的文件。'}</p>
          {onSelect && (
            <Button type="primary" onClick={() => setChoosing(true)}>
              选择主机
            </Button>
          )}
        </div>
      </div>
    )
  const label = endpoint === 'local' ? '本地' : session?.host.name || '远程文件'
  return (
    <div
      className={`file-pane ${compact ? 'compact' : ''}`}
      onScrollCapture={(e) => {
        if (e.currentTarget.contains(e.target as Node)) setContext(null)
      }}
      onDragOver={(e) => {
        if (
          onTransfer &&
          (e.dataTransfer.types.includes('application/x-quay-files') ||
            e.dataTransfer.types.includes('Files'))
        )
          e.preventDefault()
      }}
      onDrop={(e) => drop(e)}
    >
      <header className="file-pane-header">
        <button className="endpoint-label" disabled={!onSelect} onClick={() => setChoosing(true)}>
          {endpoint === 'local' ? (
            <HomeOutlined />
          ) : (
            <span className={`status-dot ${session?.state !== 'ready' ? 'offline' : ''}`} />
          )}
          <b title={label}>{label}</b>
          {onSelect && <DownOutlined className="tiny" />}
        </button>
        <span className="toolbar-spacer" />
        <Tooltip title="过滤文件">
          <Button
            type="text"
            size="small"
            aria-label="过滤文件"
            icon={<SearchOutlined />}
            onClick={() => setFiltering(!filtering)}
          />
        </Tooltip>
        <Tooltip title="刷新">
          <Button
            type="text"
            size="small"
            aria-label="刷新文件"
            icon={<ReloadOutlined spin={busy} />}
            onClick={() => load(list?.path, false)}
          />
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'mkdir', label: '新建文件夹', disabled: !list },
              { key: 'create', label: '新建文件', disabled: !list },
              { type: 'divider' },
              { key: 'rename', label: '重命名', disabled: selected.length !== 1 },
              { key: 'delete', label: '删除', danger: true, disabled: !selected.length },
              { key: 'copy-path', label: '复制路径' },
              { type: 'divider' },
              { key: 'hidden', label: <Checkbox checked={hidden}>显示隐藏文件</Checkbox> }
            ],
            onClick: (e) => action(e.key)
          }}
        >
          <Button type="text" size="small" aria-label="文件操作" icon={<MoreOutlined />} />
        </Dropdown>
      </header>
      {filtering && (
        <div className="file-filter">
          <Input
            autoFocus
            allowClear
            aria-label="文件过滤关键词"
            placeholder="过滤文件…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      <div className="file-path">
        <Button
          type="text"
          size="small"
          aria-label="返回上一目录"
          icon={<ArrowLeftOutlined />}
          disabled={!history.length}
          onClick={() => {
            const p = history[history.length - 1]
            setHistory((h) => h.slice(0, -1))
            void load(p, false)
          }}
        />
        <Button type="text" size="small" aria-label="主目录" icon={<HomeOutlined />} onClick={() => load()} />
        <Input
          aria-label={compact ? '侧栏文件路径' : '文件路径'}
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onPressEnter={() => load(pathInput)}
          variant="borderless"
          spellCheck={false}
        />
        {list && list.roots.length > 1 && (
          <Select
            className="drive-select"
            value={list.path.slice(0, 3)}
            options={list.roots.map((r) => ({ value: r }))}
            onSelect={(p) => load(p)}
          />
        )}
      </div>
      {!canLoad ? (
        <div className="file-status">
          <span className="connection-spinner" />
          <b>{session?.state === 'error' || session?.state === 'closed' ? '连接不可用' : '正在连接…'}</b>
          <p>{session?.message}</p>
          {onSelect && <Button onClick={() => setChoosing(true)}>重新选择主机</Button>}
        </div>
      ) : (
        <>
          {!compact && (
            <div className="file-columns">
              <button onClick={() => setSort('name')}>
                名称 <DownOutlined />
              </button>
              <button onClick={() => setSort('date')}>修改日期</button>
              <button onClick={() => setSort('size')}>大小</button>
              <span>类型</span>
            </div>
          )}
          {error && (
            <div className="file-error">
              {error}
              <Button type="link" onClick={() => load(pathInput)}>
                重试
              </Button>
            </div>
          )}
          <div
            className="file-rows"
            role="table"
            aria-label={`${label}文件列表`}
            tabIndex={0}
            onContextMenu={(e) => {
              e.preventDefault()
              showContext(undefined, e.clientX, e.clientY)
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault()
                e.stopPropagation()
                setSelected(visible.map((v) => v.path))
              } else if ((e.ctrlKey || e.metaKey) && ['c', 'v'].includes(e.key.toLowerCase())) {
                e.preventDefault()
                e.stopPropagation()
                void action(e.key.toLowerCase() === 'c' ? 'copy' : 'paste')
              } else if (e.key === 'Delete') {
                e.preventDefault()
                remove()
              } else if (e.key === 'F2') {
                e.preventDefault()
                action('rename')
              }
            }}
          >
            {list && list.parent !== list.path && (
              <div
                className="file-row parent-row"
                role="row"
                tabIndex={0}
                onDoubleClick={() => load(list.parent)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load(list.parent)
                }}
              >
                <span className="file-name">
                  <FolderOutlined className="folder-icon" />
                  ..
                </span>
              </div>
            )}
            {visible.map((e) => row(e))}
            {list && !visible.length && !busy && (
              <div className="file-empty">{filter ? '没有匹配的文件' : '此文件夹为空'}</div>
            )}
          </div>
          <footer className="file-footer">
            <span>
              {visible.length} 个项目{selected.length > 0 && ` · 已选 ${selected.length}`}
            </span>
            <span className="toolbar-spacer" />
            <Tooltip title={hidden ? '隐藏点文件' : '显示点文件'}>
              <Button
                type="text"
                size="small"
                aria-label="显示隐藏文件"
                icon={<EyeOutlined />}
                className={hidden ? 'filter-active' : ''}
                onClick={() => setHidden(!hidden)}
              />
            </Tooltip>
          </footer>
        </>
      )}
      <Dropdown
        open={Boolean(context)}
        autoFocus
        trigger={['click']}
        placement="bottomLeft"
        onOpenChange={(open) => {
          if (!open) setContext(null)
        }}
        menu={{
          items: contextItems,
          style: { maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' },
          onClick: ({ key }) => {
            const target = context
            setContext(null)
            if (target) void action(key, target)
          }
        }}
      >
        <span className="file-menu-anchor" style={{ left: context?.x || 0, top: context?.y || 0 }} />
      </Dropdown>
      <Modal
        open={Boolean(operation)}
        title={
          operation?.action === 'mkdir'
            ? '新建文件夹'
            : operation?.action === 'rename'
              ? '重命名'
              : '新建文件'
        }
        destroyOnHidden
        okText="确定"
        cancelText="取消"
        confirmLoading={opBusy}
        onCancel={() => setOperation(null)}
        onOk={async () => {
          setOpBusy(true)
          try {
            await window.quay.invoke('fileOperation', { endpoint, ...operation })
            setOperation(null)
            await load(list?.path, false)
          } catch (e: any) {
            message.error(e.message)
          } finally {
            setOpBusy(false)
          }
        }}
      >
        <Input
          autoFocus
          aria-label="文件名称"
          value={operation?.name || ''}
          onChange={(e) => setOperation((o) => (o ? { ...o, name: e.target.value } : o))}
        />
      </Modal>
    </div>
  )
}
export function FileEditor({
  file,
  onClose,
  onSaved
}: {
  file: FileOpen
  onClose: () => void
  onSaved: () => void
}) {
  const { modal, message } = App.useApp()
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [hash, setHash] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const format = useRef({ bom: false, newline: '\n' })
  useEffect(() => {
    let alive = true
    window.quay
      .invoke('fileRead', file)
      .then(async (result) => {
        if (alive) {
          if (result.external) {
            if (file.editOnly) setError(result.reason)
            else {
              await openLocalFile(file, message)
              if (alive) onClose()
            }
            return
          }
          format.current = {
            bom: result.text.startsWith('\ufeff'),
            newline: result.text.match(/\r\n|\r|\n/)?.[0] || '\n'
          }
          setText(result.text)
          setOriginal(result.text)
          setHash(result.hash)
        }
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [file.endpoint, file.path])
  async function save() {
    if (saving || loading || error || text === original) return
    setSaving(true)
    try {
      // Native textareas normalize line endings. Keep the file's format
      // independently of the editor value, including after repeated saves.
      const content =
        (format.current.bom && !text.startsWith('\ufeff') ? '\ufeff' : '') +
        text.replace(/\r\n|\r|\n/g, format.current.newline)
      const result = await window.quay.invoke('fileWrite', { ...file, text: content, hash })
      setHash(result.hash)
      setOriginal(text)
      onSaved()
      message.success('文件已保存')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }
  const close = () =>
    text !== original
      ? modal.confirm({ title: '放弃尚未保存的修改？', okText: '放弃修改', onOk: onClose })
      : onClose()
  return (
    <Modal
      className="file-editor-modal"
      title={
        <span>
          <FileOutlined /> {file.name}
          {text !== original && <i className="unsaved-dot" />}
          <small>UTF-8</small>
        </span>
      }
      open
      width="80vw"
      onCancel={close}
      maskClosable={false}
      footer={
        <>
          <span className="editor-path">{file.path}</span>
          <Button onClick={close}>关闭</Button>
          <Button
            type="primary"
            disabled={loading || !!error || text === original}
            loading={saving}
            onClick={save}
          >
            保存 <kbd>Ctrl / ⌘ S</kbd>
          </Button>
        </>
      }
    >
      {error ? (
        <div className="file-error">{error}</div>
      ) : (
        <textarea
          className="code-editor"
          aria-label="文件编辑器"
          spellCheck={false}
          disabled={loading}
          value={text}
          placeholder={loading ? '正在读取文件…' : ''}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault()
              e.stopPropagation()
              void save()
            }
            if (e.key === 'Tab') {
              e.preventDefault()
              const t = e.currentTarget
              const start = t.selectionStart
              const end = t.selectionEnd
              setText(text.slice(0, start) + '  ' + text.slice(end))
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = start + 2
              })
            }
          }}
        />
      )}
    </Modal>
  )
}
