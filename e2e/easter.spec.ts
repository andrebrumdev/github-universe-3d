import { expect, test } from '@playwright/test'

// Avisos conhecidos do WebGL por software (swiftshader), como no smoke.
const KNOWN_NOISE = [
  /GL Driver Message \(OpenGL, Performance/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
]
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

test('easter eggs: o Konami Code liga o modo disco, e o "Não clique aqui" pego pelo teclado faz o show do Octocat', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(m.text()))) errors.push(m.text())
  })

  await page.goto('/github-universe-3d/?nobloom&nocrash')
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Pular tutorial' }).click({ timeout: 60_000 })
  // o leitor de tela recebe as falas do Octocat (o balão visível é aria-hidden)
  const speech = page.locator('[aria-live="polite"]').first()

  for (const key of KONAMI) await page.keyboard.press(key)
  await expect(speech).toContainText('Modo disco ativado', { timeout: 10_000 })

  // o botão é alcançável pelo teclado: com o foco nele, não foge, e o Enter o pega
  const button = page.getByRole('button', { name: 'Não clique aqui' })
  await expect(button).toBeVisible()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(speech).toContainText('Eu disse pra não clicar', { timeout: 20_000 })
  // durante o show ele some; no fim volta para o canto
  await expect(button).toBeHidden()
  await expect(speech).toContainText('sem autógrafos', { timeout: 20_000 })
  await expect(button).toBeVisible({ timeout: 20_000 })
  expect(errors).toEqual([])
})
