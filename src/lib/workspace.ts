import type { DockSide, LayoutName, Pane, PaneTree, Workspace } from '../types'
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
export function pane(keepEmpty = false): Pane {
  return { id: crypto.randomUUID(), tabs: [], active: null, keepEmpty }
}
const leaf = (id: string): PaneTree => ({ type: 'pane', pane: id })
function split(axis: 'x' | 'y', first: PaneTree, second: PaneTree, ratio = 0.5): PaneTree {
  return { type: 'split', id: crypto.randomUUID(), axis, ratio, first, second }
}
function preset(layout: LayoutName, panes: Pane[]): PaneTree {
  const p = panes.map((p) => leaf(p.id))
  switch (layout) {
    case 'single':
      return p[0]
    case 'columns':
      return split('x', p[0], p[1])
    case 'rows':
      return split('y', p[0], p[1])
    case 'three-columns':
      return split('x', p[0], split('x', p[1], p[2]), 1 / 3)
    case 'three-rows':
      return split('y', p[0], split('y', p[1], p[2]), 1 / 3)
    case 'grid':
      return split('x', split('y', p[0], p[2]), split('y', p[1], p[3]))
    case 'right':
      return split('x', p[0], split('y', p[1], p[2]))
    case 'bottom':
      return split('y', p[0], split('x', p[1], p[2]))
  }
}
function shape(tree: PaneTree): string {
  if (tree.type === 'pane') return '.'
  const parts = (node: PaneTree): string[] =>
    node.type === 'split' && node.axis === tree.axis
      ? [...parts(node.first), ...parts(node.second)]
      : [shape(node)]
  return `${tree.axis}(${parts(tree).join(',')})`
}
function layoutName(tree: PaneTree): Workspace['layout'] {
  const names: Record<string, LayoutName> = {
    '.': 'single',
    'x(.,.)': 'columns',
    'y(.,.)': 'rows',
    'x(.,.,.)': 'three-columns',
    'y(.,.,.)': 'three-rows',
    'x(y(.,.),y(.,.))': 'grid',
    'y(x(.,.),x(.,.))': 'grid',
    'x(.,y(.,.))': 'right',
    'y(.,x(.,.))': 'bottom'
  }
  return names[shape(tree)] || 'custom'
}
export function initialWorkspace(): Workspace {
  const p = pane(true)
  return { layout: 'single', tree: leaf(p.id), panes: [p], focused: p.id }
}
export function changeLayout(workspace: Workspace, layout: LayoutName): Workspace {
  const count = layouts.find((x) => x.id === layout)!.count
  const panes = workspace.panes.map((p) => ({ ...p, tabs: [...p.tabs] }))
  while (panes.length < count) panes.push(pane(true))
  if (panes.length > count) {
    const extra = panes.splice(count)
    for (const p of extra) panes[count - 1].tabs.push(...p.tabs)
    if (!panes[count - 1].active) panes[count - 1].active = panes[count - 1].tabs[0] || null
  }
  for (const p of panes) p.keepEmpty = p.tabs.length === 0
  return {
    layout,
    tree: preset(layout, panes),
    panes,
    focused: panes.some((p) => p.id === workspace.focused) ? workspace.focused : panes[0].id
  }
}
export function addTab(w: Workspace, id: string, target?: string): Workspace {
  if (w.panes.some((p) => p.tabs.includes(id))) return w
  const focused = w.panes.some((p) => p.id === target) ? target! : w.focused
  return {
    ...w,
    focused,
    panes: w.panes.map((p) =>
      p.id === focused ? { ...p, tabs: [...p.tabs, id], active: id, keepEmpty: false } : p
    )
  }
}
function detachTab(w: Workspace, id: string): Workspace {
  return {
    ...w,
    panes: w.panes.map((p) => {
      const i = p.tabs.indexOf(id)
      if (i < 0) return p
      const tabs = p.tabs.filter((t) => t !== id)
      return { ...p, tabs, active: p.active === id ? tabs[Math.min(i, tabs.length - 1)] || null : p.active }
    })
  }
}
function prune(w: Workspace): Workspace {
  let panes = w.panes.filter((p) => p.tabs.length || p.keepEmpty)
  if (!panes.length) panes = [w.panes.find((p) => p.id === w.focused) || w.panes[0]]
  const ids = new Set(panes.map((p) => p.id))
  function visit(node: PaneTree): PaneTree | null {
    if (node.type === 'pane') return ids.has(node.pane) ? node : null
    const first = visit(node.first),
      second = visit(node.second)
    return first && second ? { ...node, first, second } : first || second
  }
  const tree = visit(w.tree)!
  return {
    ...w,
    tree,
    layout: layoutName(tree),
    panes,
    focused: ids.has(w.focused) ? w.focused : (panes.find((p) => p.active) || panes[0]).id
  }
}
export function removeTab(w: Workspace, id: string): Workspace {
  if (!w.panes.some((p) => p.tabs.includes(id))) return w
  return prune(detachTab(w, id))
}
export function moveTab(w: Workspace, id: string, target: string, before?: string): Workspace {
  if (!w.panes.some((p) => p.tabs.includes(id)) || !w.panes.some((p) => p.id === target) || id === before)
    return w
  const next = detachTab(w, id)
  return prune({
    ...next,
    focused: target,
    panes: next.panes.map((p) => {
      if (p.id !== target) return p
      const tabs = [...p.tabs]
      const i = before ? tabs.indexOf(before) : -1
      tabs.splice(i < 0 ? tabs.length : i, 0, id)
      return { ...p, tabs, active: id, keepEmpty: false }
    })
  })
}
export function dockTab(w: Workspace, id: string, target: string, side: DockSide): Workspace {
  const source = w.panes.find((p) => p.tabs.includes(id))
  const destination = w.panes.find((p) => p.id === target)
  if (!source || !destination || (source === destination && source.tabs.length === 1)) return w
  if (!destination.tabs.length) return moveTab(w, id, target)
  const created = { ...pane(), tabs: [id], active: id }
  const next = detachTab(w, id)
  function visit(node: PaneTree): PaneTree {
    if (node.type === 'split') return { ...node, first: visit(node.first), second: visit(node.second) }
    if (node.pane !== target) return node
    const before = side === 'left' || side === 'top'
    return split(
      side === 'left' || side === 'right' ? 'x' : 'y',
      before ? leaf(created.id) : node,
      before ? node : leaf(created.id)
    )
  }
  return prune({ ...next, tree: visit(next.tree), panes: [...next.panes, created], focused: created.id })
}
export function resizeSplit(w: Workspace, id: string, ratio: number): Workspace {
  if (!Number.isFinite(ratio)) return w
  function visit(node: PaneTree): PaneTree {
    if (node.type === 'pane') return node
    return node.id === id
      ? { ...node, ratio: Math.max(0.12, Math.min(0.88, ratio)) }
      : { ...node, first: visit(node.first), second: visit(node.second) }
  }
  return { ...w, tree: visit(w.tree) }
}
export type PaneBounds = { left: number; top: number; width: number; height: number }
export function workspaceGeometry(tree: PaneTree) {
  const panes = new Map<string, PaneBounds>()
  const splits: { id: string; axis: 'x' | 'y'; ratio: number; bounds: PaneBounds }[] = []
  function visit(node: PaneTree, b: PaneBounds) {
    if (node.type === 'pane') {
      panes.set(node.pane, b)
      return
    }
    splits.push({ id: node.id, axis: node.axis, ratio: node.ratio, bounds: b })
    if (node.axis === 'x') {
      visit(node.first, { ...b, width: b.width * node.ratio })
      visit(node.second, { ...b, left: b.left + b.width * node.ratio, width: b.width * (1 - node.ratio) })
    } else {
      visit(node.first, { ...b, height: b.height * node.ratio })
      visit(node.second, { ...b, top: b.top + b.height * node.ratio, height: b.height * (1 - node.ratio) })
    }
  }
  visit(tree, { left: 0, top: 0, width: 1, height: 1 })
  return { panes, splits }
}
