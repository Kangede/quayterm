import { useEffect, useMemo, useState } from 'react'
import { App, Button, Checkbox, Dropdown, Input, InputNumber, Select, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  BarsOutlined,
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
  TagOutlined,
  DownOutlined,
  DesktopOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import { FingerprintOutlined } from './Icons'
import type { Host, HostDraft, KnownHost, Settings } from '../types'
import { parseQuickConnect } from '../lib/quick-connect'

export function HostIcon({ host, small = false }: { host?: Partial<Host>; small?: boolean }) {
  return (
    <span className={`host-icon ${small ? 'small' : ''}`} style={{ background: host?.color || '#ed7045' }}>
      <DesktopOutlined />
    </span>
  )
}
export function HostManager({
  hosts,
  knownHosts,
  page,
  settings,
  secureStorage,
  onSave,
  onDelete,
  onConnect,
  onSettings,
  onRefreshKnown,
  openNew
}: {
  hosts: Host[]
  knownHosts: KnownHost[]
  page: 'hosts' | 'known'
  settings: Settings
  secureStorage: boolean
  onSave: (h: HostDraft) => Promise<Host>
  onDelete: (id: string) => void
  onConnect: (h: Host) => void
  onSettings: (s: Settings) => void
  onRefreshKnown: () => void
  openNew: number
}) {
  const { modal, message } = App.useApp()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>()
  const [editing, setEditing] = useState<HostDraft | null>(null)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (openNew)
      setEditing({ port: 22, username: 'root', tags: [], color: '#ed7045', rememberPassword: true })
  }, [openNew])
  useEffect(() => {
    setQuery('')
    setEditing(null)
  }, [page])
  const tags = [...new Set(hosts.flatMap((h) => h.tags))]
  const sort = settings.sort || 'newest'
  const data = useMemo(
    () =>
      hosts
        .filter(
          (h) =>
            `${h.name} ${h.address} ${h.username} ${h.tags.join(' ')} ${h.group}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (!tag || h.tags.includes(tag))
        )
        .sort((a, b) =>
          sort === 'az'
            ? a.name.localeCompare(b.name)
            : sort === 'za'
              ? b.name.localeCompare(a.name)
              : sort === 'oldest'
                ? a.createdAt - b.createdAt
                : b.createdAt - a.createdAt
        ),
    [hosts, query, tag, sort]
  )
  const update = (v: HostDraft) => setEditing((h) => ({ ...h, ...v }))
  async function save(connect = false) {
    if (!editing) return
    setSaving(true)
    try {
      const host = await onSave(editing)
      setEditing(null)
      if (connect) onConnect(host)
      else message.success('主机已保存')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }
  function quickConnect() {
    if (data.length === 1 && !query.includes('@') && !query.startsWith('ssh ')) {
      onConnect(data[0])
      return
    }
    const parsed = parseQuickConnect(query)
    if (parsed) setEditing({ ...parsed, tags: [], rememberPassword: true })
    else message.info('支持 user@host:port 或 ssh user@host -p 端口')
  }
  const viewItems = [
    { key: 'grid', label: '表格', icon: <AppstoreOutlined /> },
    { key: 'list', label: '列表', icon: <BarsOutlined /> }
  ]
  const sortItems = [
    { key: 'az', label: 'A–z' },
    { key: 'za', label: 'Z–a' },
    { type: 'divider' as const },
    { key: 'newest', label: '最新到最旧' },
    { key: 'oldest', label: '最旧到最新' }
  ]
  return (
    <div className="host-manager">
      <section className="host-main">
        {page === 'hosts' && (
          <div className="quick-bar">
            <SearchOutlined />
            <Input
              aria-label="查找主机或快速连接"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={quickConnect}
              placeholder="查找主机或 ssh user@hostname…"
              variant="borderless"
            />
            <Button size="small" disabled={!query} onClick={quickConnect}>
              连接 <ArrowRightOutlined />
            </Button>
          </div>
        )}
        <div className="host-toolbar">
          {page === 'hosts' ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                setEditing({ port: 22, username: 'root', tags: [], color: '#ed7045', rememberPassword: true })
              }
            >
              添加主机
            </Button>
          ) : (
            <Button
              icon={<ImportOutlined />}
              onClick={async () => {
                try {
                  const result = await window.quay.invoke('knownImport')
                  if (result) {
                    onRefreshKnown()
                    message.success(`导入 ${result.added} 条记录，跳过 ${result.skipped} 条`)
                  }
                } catch (e: any) {
                  message.error(e.message)
                }
              }}
            >
              导入
            </Button>
          )}
          <div className="toolbar-spacer" />
          {page === 'known' && (
            <Input
              size="small"
              prefix={<SearchOutlined />}
              aria-label="查找已知主机"
              placeholder="查找指纹或主机"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 220 }}
            />
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: viewItems,
              selectable: true,
              selectedKeys: [settings.view || 'grid'],
              onClick: (e) => onSettings({ view: e.key as 'grid' | 'list' })
            }}
          >
            <Button
              type="text"
              aria-label="显示方式"
              icon={settings.view === 'list' ? <BarsOutlined /> : <AppstoreOutlined />}
            >
              <DownOutlined className="tiny" />
            </Button>
          </Dropdown>
          {page === 'hosts' && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: tags.length
                  ? [{ key: '', label: '全部标记' }, ...tags.map((t) => ({ key: t, label: t }))]
                  : [
                      {
                        key: 'empty',
                        disabled: true,
                        label: (
                          <div className="tag-empty">
                            <TagOutlined />
                            <b>添加标记</b>
                            <span>
                              标记帮助你筛选主机。
                              <br />
                              你可以在编辑主机时添加标记。
                            </span>
                          </div>
                        )
                      }
                    ],
                selectedKeys: tag ? [tag] : [''],
                selectable: true,
                onClick: (e) => setTag(e.key || undefined)
              }}
            >
              <Button
                type="text"
                aria-label="标记筛选"
                className={tag ? 'filter-active' : ''}
                icon={<TagOutlined />}
              >
                <DownOutlined className="tiny" />
              </Button>
            </Dropdown>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: sortItems,
              selectable: true,
              selectedKeys: [sort],
              onClick: (e) => onSettings({ sort: e.key })
            }}
          >
            <Button type="text" aria-label="排序" icon={<CalendarOutlined />}>
              <DownOutlined className="tiny" />
            </Button>
          </Dropdown>
        </div>
        <div className="host-content">
          <div className="section-label">
            <h2>{page === 'hosts' ? '主机' : '已知主机'}</h2>
            <span>{page === 'hosts' ? data.length : knownHosts.length}</span>
            {tag && (
              <Tag closable onClose={() => setTag(undefined)}>
                {tag}
              </Tag>
            )}
          </div>
          {page === 'hosts' ? (
            <>
              <div className={`host-grid ${settings.view === 'list' ? 'list' : ''}`}>
                {data.map((h) => (
                  <div
                    key={h.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`host-${h.id}`}
                    className={`host-card ${selected === h.id ? 'selected' : ''}`}
                    onClick={() => setSelected(h.id)}
                    onDoubleClick={() => onConnect(h)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onConnect(h)
                    }}
                  >
                    <HostIcon host={h} />
                    <div className="host-card-text">
                      <strong>{h.name}</strong>
                      <span>ssh, {h.username}</span>
                    </div>
                    {settings.view === 'list' && (
                      <>
                        <span className="host-address">
                          {h.address}:{h.port}
                        </span>
                        <div className="host-tags">
                          {h.tags.map((t) => (
                            <Tag key={t}>{t}</Tag>
                          ))}
                        </div>
                      </>
                    )}
                    <Tooltip title="编辑主机">
                      <Button
                        className="edit-host"
                        aria-label={`编辑 ${h.name}`}
                        type="text"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(h.id)
                          setEditing({ ...h, rememberPassword: true })
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      />
                    </Tooltip>
                  </div>
                ))}
              </div>
              {!data.length && (
                <div className="empty-state">
                  <div className="empty-icon">
                    <DesktopOutlined />
                  </div>
                  <h2>{hosts.length ? '没有匹配的主机' : '让远程工作，从这里开始'}</h2>
                  <p>
                    {hosts.length
                      ? '试试其他关键词或标记。'
                      : '添加你的第一台主机，终端与文件就在同一个工作区。'}
                  </p>
                  {!hosts.length && (
                    <Button
                      type="primary"
                      onClick={() =>
                        setEditing({ port: 22, username: 'root', tags: [], rememberPassword: true })
                      }
                    >
                      添加主机
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={`host-grid known-grid ${settings.view === 'list' ? 'list' : ''}`}>
                {knownHosts
                  .filter((k) => `${k.label} ${k.fingerprint}`.toLowerCase().includes(query.toLowerCase()))
                  .sort((a, b) =>
                    sort === 'az'
                      ? a.label.localeCompare(b.label)
                      : sort === 'za'
                        ? b.label.localeCompare(a.label)
                        : sort === 'oldest'
                          ? a.createdAt - b.createdAt
                          : b.createdAt - a.createdAt
                  )
                  .map((k) => (
                    <div
                      className="host-card"
                      key={k.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        modal.info({
                          title: '主机指纹',
                          width: 590,
                          content: (
                            <div className="fingerprint-info">
                              <b>{k.label}</b>
                              <p>{k.algorithm}</p>
                              <code>{k.fingerprint}</code>
                              <p>首次信任：{new Date(k.createdAt).toLocaleString()}</p>
                            </div>
                          )
                        })
                      }
                    >
                      <span className="known-icon">
                        <FingerprintOutlined />
                      </span>
                      <div className="host-card-text">
                        <strong>{k.label}</strong>
                        <span>{k.algorithm}</span>
                      </div>
                      <Button
                        type="text"
                        aria-label={`移除 ${k.label}`}
                        className="edit-host"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          modal.confirm({
                            title: `移除 ${k.label} 的信任记录？`,
                            content: '下次连接将重新确认主机指纹。',
                            okText: '移除',
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              await window.quay.invoke('knownDelete', { id: k.id })
                              onRefreshKnown()
                            }
                          })
                        }}
                      />
                    </div>
                  ))}
              </div>
              {!knownHosts.length && (
                <div className="empty-state">
                  <div className="empty-icon">
                    <FingerprintOutlined />
                  </div>
                  <h2>熟悉的主机，可信的连接</h2>
                  <p>
                    确认过的 SSH 主机指纹会显示在这里。
                    <br />
                    也可以导入已有的 OpenSSH known_hosts 文件。
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="host-bottom">
          <span className="status-dot" /> 数据保存在此设备 <span className="toolbar-spacer" />
          双击主机连接 <kbd>Enter</kbd>
        </div>
      </section>
      {editing && (
        <aside className="host-editor">
          <header>
            <h3>{editing.id ? '主机详细信息' : '添加主机'}</h3>
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="关闭主机编辑"
              onClick={() => setEditing(null)}
            />
          </header>
          <div className="editor-fields">
            <section>
              <label>地址</label>
              <div className="address-field">
                <HostIcon host={editing} />
                <Input
                  aria-label="主机地址"
                  placeholder="IP 地址或域名"
                  value={editing.address}
                  onChange={(e) => update({ address: e.target.value })}
                />
              </div>
            </section>
            <section>
              <label>基本</label>
              <Input
                aria-label="主机名称"
                placeholder="显示名称"
                value={editing.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              <Input
                aria-label="主机分组"
                placeholder="分组（可选）"
                value={editing.group}
                onChange={(e) => update({ group: e.target.value })}
              />
              <Select
                mode="tags"
                aria-label="主机标记"
                placeholder="标记，输入后按 Enter"
                value={editing.tags}
                options={tags.map((t) => ({ value: t }))}
                onChange={(tags) => update({ tags })}
                tokenSeparators={[',', '，']}
              />
              <div className="color-row">
                <span>主机颜色</span>
                {['#ed7045', '#35a78e', '#6789c9', '#9371c0', '#c18c4c'].map((color) => (
                  <button
                    key={color}
                    aria-label={`主机颜色 ${color}`}
                    style={{ background: color }}
                    onClick={() => update({ color })}
                  >
                    {editing.color === color && <CheckOutlined />}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="port-row">
                <b>SSH</b>
                <span>端口</span>
                <InputNumber
                  aria-label="SSH 端口"
                  min={1}
                  max={65535}
                  value={editing.port}
                  onChange={(p) => update({ port: p || 22 })}
                />
              </div>
              <label>凭证</label>
              <Input
                aria-label="SSH 用户名"
                placeholder="用户名"
                value={editing.username}
                onChange={(e) => update({ username: e.target.value })}
                autoComplete="off"
              />
              <Input.Password
                aria-label="SSH 密码"
                placeholder={editing.hasPassword ? '已保存；留空保持原密码' : '密码'}
                value={editing.password}
                onChange={(e) =>
                  update({ password: e.target.value || (editing.hasPassword ? undefined : '') })
                }
                autoComplete="new-password"
              />
              <Checkbox
                checked={editing.rememberPassword !== false}
                onChange={(e) => update({ rememberPassword: e.target.checked })}
              >
                记住密码
              </Checkbox>
              {!secureStorage && <p className="field-hint">当前系统安全存储不可用，密码仅保留到应用退出。</p>}
            </section>
            <section>
              <label>退格键</label>
              <Select
                value={editing.backspace || 'delete'}
                options={[
                  { value: 'delete', label: '默认 · DEL' },
                  { value: 'ctrl-h', label: 'Ctrl+H' }
                ]}
                onChange={(backspace) => update({ backspace })}
              />
              <label>备注</label>
              <Input.TextArea
                aria-label="主机备注"
                rows={3}
                value={editing.note}
                onChange={(e) => update({ note: e.target.value })}
                placeholder="关于这台主机…"
              />
            </section>
            {editing.id && (
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: `删除主机 ${editing.name}？`,
                    content: '已连接的终端不会被中断。',
                    okText: '删除',
                    okButtonProps: { danger: true },
                    onOk: () => {
                      onDelete(editing.id!)
                      setEditing(null)
                    }
                  })
                }
              >
                删除主机
              </Button>
            )}
          </div>
          <footer>
            <Button loading={saving} onClick={() => save(false)}>
              保存
            </Button>
            <Button type="primary" loading={saving} onClick={() => save(true)}>
              保存并连接 <ArrowRightOutlined />
            </Button>
          </footer>
        </aside>
      )}
    </div>
  )
}
