import { expect, test } from '@playwright/test'

// Avisos conhecidos do WebGL por software (swiftshader) não contam como erro da aplicação. Só as mensagens exatas de
// desempenho do driver: erro de shader, perda de contexto ou falha ao criar o WebGL continuam reprovando o teste.
const KNOWN_NOISE = [
  /GL Driver Message \(OpenGL, Performance/i,
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
]

test('universo carrega, o sol abre o perfil e o Octocat reabre o tutorial', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(m.text()))) errors.push(m.text())
  })

  // ?nobloom: o bloom por software sai preto e custa caro.
  await page.goto('/github-universe-3d/?nobloom')

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Carregando dados do GitHub…')).toBeHidden({ timeout: 60_000 })

  const welcome = page.getByText(/Bem-vindo ao universo GitHub de/)
  await expect(welcome).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Pular tutorial' }).click()
  await expect(welcome).toBeHidden()

  await expect(page.getByRole('button', { name: /Começar a apresentação guiada/ })).toBeVisible()
  const tutorialButton = page.getByRole('button', { name: 'Abrir tutorial com o Octocat' })
  await expect(tutorialButton).toBeVisible()
  await expect(tutorialButton).toHaveText('? Tutorial')

  // Seleção pelo clique no sol. Na visão geral ele fica um pouco acima do centro do canvas e a câmera demora a
  // assentar em software GL, então varre uma grade pequena em volta até acertar.
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas sem dimensões')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.42
  const offsets = [0, 8, -8, 16, -16, 24, -24].flatMap((dx) => [0, 8, -8, 16, -16].map((dy) => [dx, dy]))
  let attempt = 0
  await expect(async () => {
    const [dx, dy] = offsets[attempt++ % offsets.length]
    await page.mouse.click(cx + dx, cy + dy)
    await expect(page.getByRole('dialog', { name: /Perfil de/ })).toBeVisible({ timeout: 2_500 })
  }).toPass({ timeout: 90_000 })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 })

  await tutorialButton.click()
  await expect(welcome).toBeVisible()

  expect(errors).toEqual([])
})
