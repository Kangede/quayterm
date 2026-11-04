const { expect } = require('@playwright/test')
const selectionFiles = {
  'selection/nested/nested-01.txt': 'nested one',
  'selection/nested/nested-02.txt': 'nested two',
  'selection/nested/nested-03.txt': 'nested three',
  'selection/second/second-01.txt': 'second one',
  'selection/second/second-02.txt': 'second two',
  'selection/.hidden.txt': 'hidden',
  'selection/a.txt': 'a',
  'selection/b.txt': 'b',
  'selection/c.txt': 'c',
  'selection/d.txt': 'd'
}
const multi = process.platform === 'darwin' ? 'Meta' : 'Control'
const selectedPaths = (pane) =>
  pane.locator('.file-row.selected[data-path]').evaluateAll((rows) => rows.map((r) => r.dataset.path))
const displayedPaths = (pane) =>
  pane.locator('.file-row[data-path]').evaluateAll((rows) => rows.map((r) => r.dataset.path))
function fileRow(pane, root, relative) {
  return pane.locator(`.file-row[data-path=${JSON.stringify(`${root}/${relative}`)}]`)
}
async function exerciseTreeSelection(page, app, pane, root) {
  const row = (name) => fileRow(pane, root, `selection/${name}`)
  const paths = (names) => names.map((n) => `${root}/selection/${n}`)
  const selected = async (names) => expect.poll(() => selectedPaths(pane)).toEqual(paths(names))
  await pane.getByRole('button', { name: '展开 selection', exact: true }).click()
  await expect(row('d.txt')).toBeVisible()
  await row('a.txt').click()
  await row('c.txt').click({ modifiers: ['Shift'] })
  await selected(['a.txt', 'b.txt', 'c.txt'])
  // The context menu must receive the complete range, including nested paths.
  await row('b.txt').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '复制路径', exact: true }).click()
  await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(paths(['a.txt', 'b.txt', 'c.txt']).join('\n'))
  await row('c.txt').click()
  await row('a.txt').click({ modifiers: ['Shift'] })
  await selected(['a.txt', 'b.txt', 'c.txt'])
  await row('b.txt').click({ modifiers: ['Shift'] })
  await selected(['b.txt', 'c.txt'])
  await row('d.txt').click({ modifiers: ['Shift'] })
  await selected(['c.txt', 'd.txt'])
  await row('d.txt').click({ modifiers: ['Shift'] })
  await selected(['c.txt', 'd.txt'])
  // Ctrl/Command-click remains a toggle and establishes the next range anchor.
  await row('a.txt').click()
  await row('c.txt').click({ modifiers: [multi] })
  await selected(['a.txt', 'c.txt'])
  await row('d.txt').click({ modifiers: ['Shift'] })
  await selected(['c.txt', 'd.txt'])
  await pane.getByRole('button', { name: '展开 nested', exact: true }).click()
  await pane.getByRole('button', { name: '展开 second', exact: true }).click()
  await row('nested/nested-02.txt').click()
  await row('second/second-02.txt').click({ modifiers: ['Shift'] })
  await selected([
    'nested/nested-02.txt',
    'nested/nested-03.txt',
    'second',
    'second/second-01.txt',
    'second/second-02.txt'
  ])
  await row('second/second-02.txt').click()
  await row('nested/nested-02.txt').click({ modifiers: ['Shift'] })
  await selected([
    'nested/nested-02.txt',
    'nested/nested-03.txt',
    'second',
    'second/second-01.txt',
    'second/second-02.txt'
  ])
  // A collapsed anchor must not cause an index -1 range or select hidden children.
  await row('nested/nested-02.txt').click()
  await pane.getByRole('button', { name: '展开 nested', exact: true }).click()
  await selected([])
  await row('b.txt').click({ modifiers: ['Shift'] })
  await selected(['b.txt'])
  await pane.locator('.file-rows').focus()
  await page.keyboard.press(`${multi}+a`)
  const topLevel = (await displayedPaths(pane)).filter((p) => !p.slice(root.length + 1).includes('/'))
  await expect.poll(() => selectedPaths(pane)).toEqual(topLevel)
  expect(await selectedPaths(pane)).not.toContain(`${root}/selection/nested/nested-02.txt`)
  expect(await selectedPaths(pane)).not.toContain(`${root}/selection/.hidden.txt`)
  await pane.getByRole('button', { name: '显示隐藏文件', exact: true }).click()
  await row('.hidden.txt').click()
  await pane.getByRole('button', { name: '显示隐藏文件', exact: true }).click()
  await selected([])
  await row('c.txt').click({ modifiers: ['Shift'] })
  await selected(['c.txt'])
  // Filtering out a whole branch also invalidates its selection anchor.
  await pane.getByRole('button', { name: '过滤文件', exact: true }).click()
  await pane.getByRole('textbox', { name: '文件过滤关键词', exact: true }).fill('no-matching-entry')
  await expect(pane.locator('.file-row[data-path]')).toHaveCount(0)
  await selected([])
  await pane.getByRole('textbox', { name: '文件过滤关键词', exact: true }).fill('selection')
  await row('b.txt').click({ modifiers: ['Shift'] })
  await selected(['b.txt'])
  await pane.getByRole('textbox', { name: '文件过滤关键词', exact: true }).fill('')
  await pane.getByRole('button', { name: '过滤文件', exact: true }).click()
  // Leave a reverse range whose anchor differs from the first selected path.
  await row('c.txt').click()
  await row('a.txt').click({ modifiers: ['Shift'] })
  await selected(['a.txt', 'b.txt', 'c.txt'])
}
module.exports = { selectionFiles, exerciseTreeSelection, fileRow, selectedPaths, displayedPaths, multi }
