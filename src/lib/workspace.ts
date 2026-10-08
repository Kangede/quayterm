import type { LayoutName, Pane, Workspace } from '../types'
export const layouts: { id: LayoutName; name: string; count: number; columns: number; rows: number }[] = [
  { id: 'single', name: '单一', count: 1, columns: 1, rows: 1 },
  { id: 'columns', name: '双列', count: 2, columns: 2, rows: 1 },
  { id: 'three-columns', name: '三列', count: 3, columns: 3, rows: 1 },
  { id: 'rows', name: '双行', count: 2, columns: 1, rows: 2 },
  { id: 'three-rows', name: '三行', count: 3, columns: 1, rows: 3 },
  { id: 'grid', name: '网格 2×2', count: 4, columns: 2, rows: 2 },
  { id: 'right', name: '右侧双行', count: 3, columns: 2, rows: 2 },
  { id: 'bottom', name: '底部双列', count: 3, columns: 2, rows: 2 }
]
export function pane(): Pane {
  return { id: crypto.randomUUID(), tabs: [], active: null }
}
export function initialWorkspace(): Workspace {
  const p = pane()
  return { layout: 'single', panes: [p], focused: p.id }
}
export function changeLayout(workspace: Workspace, layout: LayoutName): Workspace {
  const count = layouts.find((x) => x.id === layout)!.count
  const panes = workspace.panes.map((p) => ({ ...p, tabs: [...p.tabs] }))
  while (panes.length < count) panes.push(pane())
  if (panes.length > count) {
    const extra = panes.splice(count)
    for (const p of extra) panes[count - 1].tabs.push(...p.tabs)
    if (!panes[count - 1].active) panes[count - 1].active = panes[count - 1].tabs[0] || null
  }
  return {
    layout,
    panes,
    focused: panes.some((p) => p.id === workspace.focused) ? workspace.focused : panes[0].id
  }
}
export function addTab(w: Workspace, id: string, target?: string): Workspace {
  const focused = w.panes.some((p) => p.id === target) ? target! : w.focused
  return {
    ...w,
    focused,
    panes: w.panes.map((p) => (p.id === focused ? { ...p, tabs: [...p.tabs, id], active: id } : p))
  }
}
export function removeTab(w: Workspace, id: string): Workspace {
  return {
    ...w,
    panes: w.panes.map((p) => {
      const i = p.tabs.indexOf(id)
      const tabs = p.tabs.filter((t) => t !== id)
      return { ...p, tabs, active: p.active === id ? tabs[Math.min(i, tabs.length - 1)] || null : p.active }
    })
  }
}
export function moveTab(w: Workspace, id: string, target: string, before?: string): Workspace {
  if (!w.panes.some((p) => p.tabs.includes(id)) || !w.panes.some((p) => p.id === target) || id === before)
    return w
  const next = removeTab(w, id)
  return {
    ...next,
    focused: target,
    panes: next.panes.map((p) => {
      if (p.id !== target) return p
      const tabs = [...p.tabs]
      const i = before ? tabs.indexOf(before) : -1
      tabs.splice(i < 0 ? tabs.length : i, 0, id)
      return { ...p, tabs, active: id }
    })
  }
}
