import { defineConfig, devices } from '@playwright/test'

/** O ?crash (trombada forçada) só existe em desenvolvimento: o teste dela roda contra o servidor de dev. */
const CRASH_DEV_PORT = 5288

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /crash\.spec\.ts/ },
    {
      name: 'crash-dev',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${CRASH_DEV_PORT}` },
      testMatch: /crash\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm build && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173/github-universe-3d/',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm dev --port ${CRASH_DEV_PORT} --strictPort`,
      url: `http://localhost:${CRASH_DEV_PORT}/github-universe-3d/`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
