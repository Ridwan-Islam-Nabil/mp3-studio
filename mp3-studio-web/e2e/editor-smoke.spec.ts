import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE = path.join(__dirname, "fixtures", "tone-5s.mp3"); // 5 s 440 Hz sine, ~20 KB

test("upload → cut → export produces an MP3 download", async ({ page }) => {
  // Export failures surface as window.alert(); fail fast with its text instead of timing out.
  page.on("dialog", async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    throw new Error(`Unexpected dialog: ${message}`);
  });

  // The FFmpeg core must come from our own origin (public/ffmpeg/<version>/), never a CDN.
  // context.on("request") also sees requests made by the FFmpeg web worker.
  const coreRequests: string[] = [];
  page.context().on("request", (req) => {
    if (/ffmpeg-core\.(js|wasm)$/.test(new URL(req.url()).pathname)) coreRequests.push(req.url());
  });

  await page.goto("/editor");

  // ── Upload via the real "Browse files" flow ───────────────────────────────
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

  // ── Create a cut region by dragging across the middle of the waveform ─────
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

  // ── Export and check the download ─────────────────────────────────────────
  const downloadPromise = page.waitForEvent("download", { timeout: 3 * 60_000 });
  await page.getByRole("button", { name: /Export MP3/ }).click();
  const download = await downloadPromise;

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
});
