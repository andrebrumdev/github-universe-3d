import { expect, test } from '@playwright/test'

// Trombada rara na tela, forçada pelo ?crash — que só existe em desenvolvimento: este arquivo roda no projeto
// `crash-dev` (servidor de desenvolvimento), não no build de produção dos outros testes.
// No WebGL por software a cena anda a poucos quadros por segundo e a simulação da nave em câmera lenta (passo
// travado): os prazos são largos de propósito.
const APOLOGY = 'Opa, foi mal, vim rápido demais.'
const KNOWN_NOISE = [
  /GL Driver Message \(OpenGL, Performance/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
]

test('?crash: a volta bate na tela, o vidro trinca e some, e o Octocat pede desculpas uma vez', async ({ page }) => {
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(m.text()))) errors.push(m.text())
  })
  // conta quantas vezes a desculpa entra na região aria-live (o balão visível é aria-hidden; o leitor ouve esta)
  // (texto puro: o tsconfig do e2e não tem a lib do DOM)
  await page.addInitScript({
    content: `
      window.__apologies = 0
      new MutationObserver((mutations) => {
        for (const m of mutations) for (const node of m.addedNodes) {
          const live = node.parentElement && node.parentElement.closest('[aria-live]')
          if (live && node.textContent && node.textContent.includes(${JSON.stringify(APOLOGY)})) window.__apologies++
        }
      }).observe(document, { childList: true, subtree: true })
    `,
  })

  await page.goto('/github-universe-3d/?nobloom&crash')
  const canvas = page.locator('#root canvas')
  await expect(canvas).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: 'Pular tutorial' }).click({ timeout: 120_000 })

  // vai ao sol (perfil): a volta dele é elegível como a de um planeta e o clique é determinístico
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas sem dimensões')
  const offsets = [0, 8, -8, 16, -16, 24, -24].flatMap((dx) => [0, 8, -8, 16, -16].map((dy) => [dx, dy]))
  let attempt = 0
  await expect(async () => {
    const [dx, dy] = offsets[attempt++ % offsets.length]
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height * 0.42 + dy)
    // acertou o sol quando a dica da viagem (ou, já na chegada, o painel do perfil) aparece; o painel só vem com a nave
    const sun = page.locator('[data-target="sun"], [role="dialog"][aria-label^="Perfil de"]').first()
    try {
      await expect(sun).toBeVisible({ timeout: 2_500 })
    } catch (e) {
      // pegou um planeta (ou nada): volta à galáxia antes de tentar de novo
      if (await page.getByRole('button', { name: '← Galáxia' }).isVisible()) await page.getByRole('button', { name: '← Galáxia' }).click()
      throw e
    }
  }).toPass({ timeout: 180_000 })

  // volta (no meio da viagem mesmo: também é uma volta de um alvo) — e bate na tela
  // (com ?crash toda volta bate: um "← Galáxia" das tentativas acima pode ter trombado e pedido desculpas antes; a
  // conta começa aqui)
  await page.evaluate('window.__apologies = 0')
  await page.mouse.move(5, 5)
  await page.keyboard.press('Escape')
  const overlay = page.locator('[data-crash-overlay]')
  await expect(overlay).toBeAttached({ timeout: 300_000 })
  await expect(overlay).toHaveAttribute('aria-hidden', 'true')
  await expect(overlay).toHaveCSS('pointer-events', 'none')
  // o vidro se conserta e a camada sai; a tela parou de tremer
  await expect(overlay).toHaveCount(0, { timeout: 300_000 })
  await expect(canvas).not.toHaveAttribute('style', /translate/)

  const live = page.locator('[aria-live="polite"]')
  await expect(live.getByText(APOLOGY)).toHaveCount(1, { timeout: 300_000 })
  // a fala termina e não volta
  await expect(live.getByText(APOLOGY)).toHaveCount(0, { timeout: 60_000 })
  await page.waitForTimeout(5_000)
  expect(await page.evaluate('window.__apologies')).toBe(1)
  expect(errors).toEqual([])
})
