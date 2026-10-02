import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pilotRoot = resolve(here, '../public/assets/office-pilot')

await rm(pilotRoot, { recursive: true, force: true })
console.log('office pilot assets cleaned')
