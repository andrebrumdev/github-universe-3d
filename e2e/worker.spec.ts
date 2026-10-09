import { expect, test, type Page } from '@playwright/test'

// Worker da cena (src/workers): órbitas e texturas fora da thread principal, com a thread principal de reserva.
const KNOWN_NOISE = [
  /GL Driver Message \(OpenGL, Performance/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
]

/** Mínimo de pixels de célula verde na tela (1280×720): com textura, ~1 mil no primeiro quadro e ~5 mil depois. */
const GREEN_MIN = 400

function watch(page: Page) {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(m.text()))) errors.push(m.text())
  })
  page.on('worker', (w) => workers.push(w.url()))
  return { errors, workers }
}

/**
 * Pixels de célula de contribuição na tela (verde dominante: a grade da superfície e o brilho dela). Planeta sem
 * textura não tem nenhum. A conta roda na página (o tsconfig do e2e não tem a lib do DOM: texto puro).
 */
async function greenCellPixels(page: Page): Promise<number> {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${png}'
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 10) n++
    return n
  })()`)
}

async function sceneOpens(page: Page) {
  await page.goto('/github-universe-3d/?nobloom&nocrash')
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Carregando dados do GitHub…')).toBeHidden({ timeout: 60_000 })
  await expect(page.getByText(/Bem-vindo ao universo GitHub de/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Tentar de novo/ })).toHaveCount(0)
}

test('o worker da cena sobe (com a base do GitHub Pages) e a cena abre', async ({ page }) => {
  const { errors, workers } = watch(page)
  await sceneOpens(page)
  expect(workers.some((url) => /\/github-universe-3d\/assets\/scene\.worker-[\w-]+\.js$/.test(url))).toBe(true)
  expect(errors).toEqual([])
})

test('os planetas já aparecem com textura no primeiro quadro depois do Loader', async ({ page }) => {
  const { errors } = watch(page)
  await page.goto('/github-universe-3d/?nobloom&nocrash')
  await expect(page.getByText('Carregando dados do GitHub…')).toBeHidden({ timeout: 60_000 })
  // logo que o Loader some (a cena espera as texturas do worker atrás dele)
  expect(await greenCellPixels(page)).toBeGreaterThan(GREEN_MIN)
  expect(errors).toEqual([])
})

test('sem Worker (navegador antigo): tudo roda na thread principal, como antes', async ({ page }) => {
  const { errors, workers } = watch(page)
  await page.addInitScript({ content: 'delete window.Worker; delete window.OffscreenCanvas' })
  await sceneOpens(page)
  expect(workers).toEqual([])
  expect(await greenCellPixels(page)).toBeGreaterThan(GREEN_MIN)
  expect(errors).toEqual([])
})

test('o script do worker não carrega (hash velho depois de um deploy): a cena segue na thread principal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/scene\.worker-[\w-]+\.js/, (route) => route.abort())
  await sceneOpens(page)
  expect(await greenCellPixels(page)).toBeGreaterThan(GREEN_MIN)
  expect(errors).toEqual([])
})
