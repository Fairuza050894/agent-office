import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(__dirname, '..', 'dist')
const markers = [
  '__AGENT_OFFICE_DIARAMA__',
  'data-office-diorama-debug',
  'Simulated Product Manager',
  'Office Diorama fixture',
  '__AGENT_OFFICE_DIARAMA_PILOT__',
  'office-pilot/kenney',
  'Kenney kit pilot',
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(target)))
    } else if (/\.(?:js|css|html)$/.test(entry.name)) {
      files.push(target)
    }
  }

  return files
}

const files = await filesUnder(distRoot)
const failures = []

for (const file of files) {
  const content = await readFile(file, 'utf8')
  for (const marker of markers) {
    if (content.includes(marker)) failures.push({ file, marker })
  }
}

try {
  await access(path.join(distRoot, 'assets', 'office-pilot'))
  failures.push({
    file: path.join(distRoot, 'assets', 'office-pilot'),
    marker: 'pilot asset directory',
  })
} catch {
  // Expected: production build must not contain pilot assets.
}

if (failures.length > 0) {
  console.error('Diorama debug/pilot content leaked into the production bundle:')
  for (const failure of failures) {
    console.error(`- ${path.relative(distRoot, failure.file)}: ${failure.marker}`)
  }
  process.exitCode = 1
} else {
  console.log('Production bundle contains no Diorama debug or pilot markers/assets.')
}
