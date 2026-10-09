import { expect, test } from '@playwright/test'
import { escortPlacement, shipScreenBox } from '../src/lib/ship/escort'
import { FOCUS_HINT } from '../src/lib/ship/focus'
import { reservedRects } from '../src/lib/uiLayout'

// Avisos conhecidos do WebGL por software (swiftshader), como no smoke.
const KNOWN_NOISE = [
  /GL Driver Message \(OpenGL, Performance/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
]

test('clicar no Octocat entra no modo de foco (dica na tela) e o Esc volta à visão geral', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(m.text()))) errors.push(m.text())
  })

  await page.goto('/github-universe-3d/?nobloom&nocrash')
  const canvas = page.locator('#root canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Pular tutorial' }).click({ timeout: 60_000 })

  const tutorialButton = page.getByRole('button', { name: 'Abrir tutorial com o Octocat' })
  const back = page.getByRole('button', { name: '← Galáxia' })
  const hint = page.getByRole('status').filter({ hasText: FOCUS_HINT })
  await expect(tutorialButton).toBeVisible()

  // A nave da escolta fica no canto, na caixa que lib/ship/escort calcula para esta tela (sem tutorial nem painel).
  // Ela volta do sol depois do "Pular tutorial" e flutua: varre uma grade na caixa até o clique pegar nela.
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('sem viewport')
  const { width, height } = viewport
  const box = shipScreenBox(escortPlacement({ width, height, reserved: reservedRects(width, height) }), height)
  const points = [0.4, 0.5, 0.3, 0.6].flatMap((fx) => [0.5, 0.4, 0.6].map((fy) => [box.x + box.w * fx, box.y + box.h * fy]))
  let attempt = 0
  await expect(async () => {
    const [x, y] = points[attempt++ % points.length]
    await page.mouse.click(x, y)
    await expect(hint).toBeVisible({ timeout: 2_500 })
  }).toPass({ timeout: 150_000 })

  // No modo: "← Galáxia" na tela e os botões flutuantes fora do caminho; o tutorial não abriu.
  await expect(back).toBeVisible()
  await expect(tutorialButton).toBeHidden()
  await expect(page.getByRole('region', { name: 'Tutorial' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(hint).toBeHidden()
  await expect(back).toBeHidden()
  await expect(tutorialButton).toBeVisible()
  expect(errors).toEqual([])
})
