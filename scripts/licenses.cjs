const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const output = [
  'QuayTerm third-party notices',
  'Original QuayTerm code is proprietary. Third-party components retain their own licenses.',
  'This inventory includes runtime, renderer and build dependencies for completeness.',
  'Electron also ships LICENSE and LICENSES.chromium.html alongside the executable.',
  ''
]
const upstream = path.join(root, 'resources/electerm-MIT.txt')
if (fs.existsSync(upstream))
  output.push(
    'Architecture reference: electerm/electerm (MIT); no Termius code or assets are included.',
    fs.readFileSync(upstream, 'utf8'),
    ''
  )
const seen = new Set()
for (const location of Object.keys(lock.packages).sort()) {
  if (!location) continue
  const folder = path.join(root, location)
  const manifest = path.join(folder, 'package.json')
  if (!fs.existsSync(manifest)) continue
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const id = `${pkg.name}@${pkg.version}`
  if (seen.has(id)) continue
  seen.add(id)
  output.push(
    '='.repeat(72),
    id,
    `License: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || 'See package')}`,
    typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || pkg.homepage || ''
  )
  const files = fs
    .readdirSync(folder)
    .filter(
      (file) =>
        /^(licen[cs]e|copying|notice)(\.|$)/i.test(file) && fs.statSync(path.join(folder, file)).isFile()
    )
  for (const file of files) output.push(fs.readFileSync(path.join(folder, file), 'utf8'))
  if (!files.length)
    output.push(
      'License identifier as declared by the package author. Full source and metadata: https://www.npmjs.com/package/' +
        pkg.name
    )
  output.push('')
}
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), output.join('\n'))
console.log(`Wrote notices for ${seen.size} packages`)
