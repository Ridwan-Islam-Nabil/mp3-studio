import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * Smoke test for the editor. Runs against a production build (`next build && next start`)
 * because that is what Vercel serves. The first Export loads the ~30 MB FFmpeg core
 * (served by the app itself from /ffmpeg/<version>/), so timeouts are generous.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 4 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // One browser only: `--project=chromium|firefox|webkit` (or `npm run test:e2e:<browser>`).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // CI has just run `npm run build` in an earlier step, so only start the server there.
    command: process.env.CI
      ? `npm run start -- --port ${PORT}`
      : `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 5 * 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
