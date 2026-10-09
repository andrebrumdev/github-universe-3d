import { expect, test } from '@playwright/test'

// Pixels do worker (OffscreenCanvas) × thread principal (canvas do DOM), byte a byte, no navegador de verdade: roda
// no servidor de desenvolvimento, que serve os módulos de src/ (o build de produção não os expõe).
// (texto puro: o tsconfig do e2e não tem a lib do DOM)
const COMPARE = `(async () => {
  const src = '/github-universe-3d/src/'
  const jobs = await import(src + 'workers/jobs.ts')
  const { createJobRunner } = await import(src + 'workers/jobRunner.ts')
  const { context2d, domCanvas, flipRows } = await import(src + 'components/three/texturePixels.ts')
  const { composeSunFace, SUN_FACE_VARIANTS } = await import(src + 'components/three/sunFacePixels.ts')
  const { drawSunFace, SUN_TEX_W, SUN_TEX_H } = await import(src + 'components/three/sunFace.ts')
  const worker = new Worker(new URL(src + 'workers/scene.worker.ts?worker_file&type=module', location.origin), { type: 'module' })
  const runner = createJobRunner({ createWorker: () => worker, loadLocal: async () => { throw new Error('rodou na thread principal') } })
  const local = (job) => jobs.runJob(job, domCanvas).output
  const diff = (a, b) => {
    if (a.length !== b.length) return -1
    let n = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
    return n
  }
  const universe = await (await fetch('/github-universe-3d/universe.json')).json()
  const out = []
  for (const r of universe.repos) {
    const job = { kind: 'planet', weeks: r.activity.weeks }
    out.push(['planeta ' + r.name, diff(await runner.run(job), local(job))])
  }
  const langs = new Map()
  for (const r of universe.repos) for (const l of r.languages) langs.set(l.name, l.color)
  // sem ícone: a sigla em texto (fonte do sistema no worker também)
  langs.set('C#', '#178600'); langs.set('Makefile', '#427819'); langs.set('Objective-C', '#438eff'); langs.set('Zig', '#ec915c')
  for (const [language, color] of langs) {
    const job = { kind: 'moon', language, color }
    out.push(['lua ' + language, diff(await runner.run(job), local(job))])
  }
  const fromWorker = await runner.run({ kind: 'sunFaces' })
  const fromMain = local({ kind: 'sunFaces' })
  for (const v of SUN_FACE_VARIANTS) {
    out.push(['sol ' + v.key, diff(fromWorker[v.key], fromMain[v.key])])
    // a textura montada (corpo + pedaço do rosto) é a mesma que o canvas inteiro pintado com o rosto, como antes
    const ctx = context2d(domCanvas(SUN_TEX_W, SUN_TEX_H))
    drawSunFace(ctx, v.expression, v.closed)
    const full = flipRows(ctx.getImageData(0, 0, SUN_TEX_W, SUN_TEX_H).data, SUN_TEX_W, SUN_TEX_H)
    out.push(['sol montado ' + v.key, diff(composeSunFace(fromWorker[v.key]), full)])
  }
  worker.terminate()
  return out
})()`

test('worker e thread principal pintam as mesmas texturas, byte a byte', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/github-universe-3d/?nocrash')
  const results = (await page.evaluate(COMPARE)) as [string, number][]
  expect(results.length).toBeGreaterThan(30)
  expect(results.filter(([, n]) => n !== 0)).toEqual([])
})
