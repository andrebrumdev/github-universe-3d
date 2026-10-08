import { writeFile } from 'node:fs/promises'
import { fetchUniverse } from '../src/lib/github/fetchUniverse'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Sem .env.local: usa as variáveis do ambiente (GitHub Action).
}

const token = process.env.UNIVERSE_TOKEN
const login = process.env.UNIVERSE_LOGIN
if (!token) {
  console.error('Defina UNIVERSE_TOKEN em Settings → Secrets (Action) ou em .env.local (local).')
  process.exit(1)
}
if (!login) {
  console.error('Defina UNIVERSE_LOGIN com o usuário do GitHub.')
  process.exit(1)
}

const warn = (m: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${m}` : `aviso: ${m}`)
const universe = await fetchUniverse(login, { token, onWarning: warn })
await writeFile('public/universe.json', JSON.stringify(universe) + '\n')
console.log(`universe.json: ${universe.repos.length} planetas de ${login}, gerado em ${universe.generatedAt}`)
