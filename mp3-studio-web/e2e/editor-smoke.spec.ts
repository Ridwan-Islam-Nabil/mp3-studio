import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const FIXTURE = path.join(__dirname, "fixtures", "tone-5s.mp3"); // 5 s 440 Hz sine, ~20 KB

/**
 * Records what the COOP/COEP decision depends on (see "The COOP/COEP headers" in CLAUDE.md):
 * whether the page is cross-origin isolated, whether SharedArrayBuffer exists, and any console
 * errors. Printed as one `[coi]` line per test (visible in the list reporter / CI log) and added
 * as annotations. Uncaught page errors fail the test.
 */
function watchDiagnostics(page: Page, testInfo: TestInfo) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  return {
    async record() {
      const env = await page.evaluate(() => ({
        crossOriginIsolated: self.crossOriginIsolated,
        sharedArrayBuffer: typeof SharedArrayBuffer,
      }));
      const browser = testInfo.project.name;
      console.log(
        `[coi] ${browser} "${testInfo.title}": crossOriginIsolated=${env.crossOriginIsolated} ` +
          `typeof SharedArrayBuffer=${env.sharedArrayBuffer} consoleErrors=${JSON.stringify(consoleErrors)}`,
      );
      testInfo.annotations.push(
        { type: "crossOriginIsolated", description: String(env.crossOriginIsolated) },
        { type: "SharedArrayBuffer", description: env.sharedArrayBuffer },
        { type: "consoleErrors", description: JSON.stringify(consoleErrors) },
      );
      expect(pageErrors, "uncaught page errors").toEqual([]);
    },
  };
}

/** Rejects with the toast's text as soon as an error toast appears (Preview/Export failed). */
async function failOnErrorToast(page: Page): Promise<never> {
  const toast = page.getByTestId("toast-error");
  await toast.waitFor({ state: "visible", timeout: 0 });
  throw new Error(`Error toast: ${await toast.innerText()}`);
}

/** Opens /editor, uploads the fixture via "Browse files" and drags one cut across 30–60 %. */
async function uploadAndCut(page: Page) {
  await page.goto("/editor");

  const browse = page.getByRole("button", { name: "Browse files" });
  await expect(browse).toBeVisible({ timeout: 60_000 }); // editor is lazy-loaded (ssr: false)
  const chooserPromise = page.waitForEvent("filechooser");
  await browse.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(FIXTURE);

  await expect(page.getByText("tone-5s.mp3")).toBeVisible();
  // "Mark to Cut" is enabled only once WaveSurfer has decoded the audio (duration > 0).
  await expect(page.getByRole("button", { name: /Mark to Cut/ })).toBeEnabled();
  await expect(page.getByText(/No cuts yet/)).toBeVisible();

  const waveform = page.getByTestId("waveform");
  await waveform.scrollIntoViewIfNeeded();
  const box = await waveform.boundingBox();
  if (!box) throw new Error("waveform has no bounding box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 10 });
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText(/No cuts yet/)).toBeHidden();
  await expect(page.getByText("(1)", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+:\d{2}\.\d → \d+:\d{2}\.\d$/)).toBeVisible();
  // WaveSurfer swallows clicks for a moment after a drag ends (see CLAUDE.md → Tests).
  await page.waitForTimeout(100);
}

test("upload → cut → export produces an MP3 download", async ({ page }, testInfo) => {
  const diagnostics = watchDiagnostics(page, testInfo);

  // The FFmpeg core must come from our own origin (public/ffmpeg/<version>/), never a CDN.
  // context.on("request") also sees requests made by the FFmpeg web worker.
  const coreRequests: string[] = [];
  page.context().on("request", (req) => {
    if (/ffmpeg-core\.(js|wasm)$/.test(new URL(req.url()).pathname)) coreRequests.push(req.url());
  });

  await uploadAndCut(page);

  const downloadPromise = page.waitForEvent("download", { timeout: 3 * 60_000 });
  await page.getByRole("button", { name: /Export MP3/ }).click();
  const download = await Promise.race([downloadPromise, failOnErrorToast(page)]);

  expect(download.suggestedFilename()).toMatch(/\.mp3$/);
  const file = await download.path();
  const bytes = await readFile(file);
  expect(bytes.length).toBeGreaterThan(0);
  // Looks like an MP3: an ID3 tag or an MPEG audio frame sync (11 set bits).
  const isId3 = bytes.subarray(0, 3).toString("latin1") === "ID3";
  const isFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  expect(isId3 || isFrameSync).toBe(true);

  await expect(page.getByRole("button", { name: /Exported!/ })).toBeVisible();

  const origin = new URL(page.url()).origin;
  expect(coreRequests.length).toBeGreaterThan(0);
  for (const url of coreRequests) expect(url.startsWith(`${origin}/ffmpeg/`)).toBe(true);

  await diagnostics.record();
});

test("upload → cut → preview plays the shortened result", async ({ page }, testInfo) => {
  const diagnostics = watchDiagnostics(page, testInfo);

  await uploadAndCut(page);

  await page.getByRole("button", { name: /▶ Preview/ }).click();
  const modal = page.getByTestId("preview-modal");
  await Promise.race([modal.waitFor({ state: "visible", timeout: 3 * 60_000 }), failOnErrorToast(page)]);
  await expect(page.getByRole("dialog", { name: "Preview" })).toBeVisible();

  // The browser must be able to load the merged MP3: ~5 s minus a ~1.5 s cut.
  const audio = modal.locator("audio");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration), { timeout: 30_000 })
    .toBeGreaterThan(2);
  const duration = await audio.evaluate((a: HTMLAudioElement) => a.duration);
  expect(duration).toBeLessThan(4.8);
  expect(await audio.evaluate((a: HTMLAudioElement) => a.error?.code ?? null)).toBeNull();

  await diagnostics.record();
});
