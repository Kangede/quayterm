import type { FileEntry } from '../types'

export type FileRow = { entry: FileEntry; children: FileRow[] }
export type FileSelection = { selected: string[]; anchor: string | null }

// Use the same tree for rendering and selection, including only open branches.
// Root entries already have the pane's filter/sort applied; SFTP child listings
// retain their displayed order and the existing hidden-file preference.
export function fileTreeRows(
  entries: FileEntry[],
  expanded: Record<string, FileEntry[]>,
  showHidden: boolean
): FileRow[] {
  const ancestors = new Set<string>()
  function visit(entries: FileEntry[]): FileRow[] {
    const rows: FileRow[] = []
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue
      let children: FileRow[] = []
      if (entry.isDirectory && expanded[entry.path] && !ancestors.has(entry.path)) {
        ancestors.add(entry.path)
        children = visit(expanded[entry.path])
        ancestors.delete(entry.path)
      }
      rows.push({ entry, children })
    }
    return rows
  }
  return visit(entries)
}

export function displayedFilePaths(rows: FileRow[]): string[] {
  return rows.flatMap(({ entry, children }) => [entry.path, ...displayedFilePaths(children)])
}

export function visibleSelection(selection: FileSelection, paths: string[]): FileSelection {
  const visible = new Set(paths)
  const selected = selection.selected.filter((p) => visible.has(p))
  const anchor = selection.anchor && visible.has(selection.anchor) ? selection.anchor : null
  return selected.length === selection.selected.length && anchor === selection.anchor
    ? selection
    : { selected, anchor }
}

export function selectFile(
  selection: FileSelection,
  paths: string[],
  target: string,
  modifiers: { range: boolean; toggle: boolean }
): FileSelection {
  const current = visibleSelection(selection, paths)
  const end = paths.indexOf(target)
  if (end < 0) return current
  const start = current.anchor ? paths.indexOf(current.anchor) : -1
  if (modifiers.range && start >= 0)
    return {
      selected: [...new Set(paths.slice(Math.min(start, end), Math.max(start, end) + 1))],
      anchor: current.anchor
    }
  if (modifiers.toggle && !modifiers.range)
    return {
      selected: current.selected.includes(target)
        ? current.selected.filter((p) => p !== target)
        : [...current.selected, target],
      anchor: target
    }
  return { selected: [target], anchor: target }
}
