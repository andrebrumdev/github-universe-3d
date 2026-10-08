import { writeFile } from 'node:fs/promises'
import { buildSampleUniverse } from '../src/lib/github/sample'

const universe = buildSampleUniverse()
await writeFile('public/universe.json', JSON.stringify(universe) + '\n')
console.log(`universe.json de exemplo: ${universe.repos.length} planetas`)
