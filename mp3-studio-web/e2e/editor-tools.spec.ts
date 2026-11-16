import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * Tools panel (wave 4): remove silence, output formats, ringtone mode, keep mode, export one
 * section, and the `?tool=` links. Every test gets a fresh browser context (localStorage empty →
 * default settings). Format checks parse the downloaded bytes (no native ffmpeg needed), so the
 * spec runs the same in Chromium, Firefox and WebKit.
 */

const TONE = path.join(__dirname, "fixtures", "tone-5s.mp3");
// 8 s mono 440 Hz tone with silence at 1.5–3.0 s and 5.0–6.5 s (~64 KB).
const SILENCE = path.join(__dirname, "fixtures", "tone-silence-8s.mp3");

async function upload(page: Page, file: string) {
  const browse = page.getByRole("button", { name: "Browse files" });
  await expect(browse).toBeVisible({ timeout: 60_000 }); // editor is lazy-loaded (ssr: false)
  const chooserPromise = page.waitForEvent("filechooser");
  await browse.click();
  await (await chooserPromise).setFiles(file);
  // Enabled once WaveSurfer has decoded the audio (duration > 0).
  await expect(page.getByRole("button", { name: /Mark to (Cut|Keep)/ })).toBeEnabled();
}

/** Rejects with the toast's text as soon as an error toast appears. */
async function failOnErrorToast(page: Page): Promise<never> {
  const toast = page.getByTestId("toast-error");
  await toast.waitFor({ state: "visible", timeout: 0 });
  throw new Error(`Error toast: ${await toast.innerText()}`);
}

/** Clicks `button` and returns the download it triggers (fails fast on an error toast). */
async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent("download", { timeout: 3 * 60_000 });
  await click();
  const dl: Download = await Promise.race([downloadPromise, failOnErrorToast(page)]);
  return { name: dl.suggestedFilename(), bytes: await readFile(await dl.path()) };
}

/** Duration of a PCM WAV file from its header (byte rate + data chunk size). */
function wavDuration(buf: Buffer): number {
  expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
  expect(buf.toString("latin1", 8, 12)).toBe("WAVE");
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("latin1", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(off + 16);
    if (id === "data") return Math.min(size, buf.length - off - 8) / byteRate;
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in WAV");
}

const tools = (page: Page) => page.getByTestId("tools-panel");
const rows = (page: Page) => page.getByTestId("region-list").locator("[data-region-row]");

test("Remove silence adds the silent parts as cuts in one undo step", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, SILENCE);
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();

  const detect = tools(page).getByRole("button", { name: "Detect silence" });
  await detect.click();
  await Promise.race([expect(rows(page)).toHaveCount(2, { timeout: 3 * 60_000 }), failOnErrorToast(page)]);
  await expect(page.getByTestId("toast-success").filter({ hasText: "Added 2 cuts for silence" })).toBeVisible();

  // Silences at 1.5–3.0 and 5.0–6.5 s, padded by 0.15 s on each side.
  const times = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(times).toEqual(["Cut 0:01.6 to 0:02.8", "Cut 0:05.1 to 0:06.3"]);
  // The parts between the cuts are listed for "export this section".
  await expect(page.getByTestId("kept-parts").locator("[data-kept-part]")).toHaveCount(3);

  // One undo removes both cuts.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(rows(page)).toHaveCount(0);
});

test("WAV export downloads a .wav of the full length", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, TONE);

  await tools(page).getByRole("button", { name: "WAV", exact: true }).click();
  await expect(page.getByTestId("output-extension")).toHaveText(".wav");
  const { name, bytes } = await download(page, () => page.getByRole("button", { name: "⬇ Export WAV" }).click());

  expect(name).toBe("tone-5s.wav");
  expect(wavDuration(bytes)).toBeCloseTo(5, 1);
});

test("ringtone mode downloads an .m4r (MPEG-4 audio)", async ({ page }) => {
  await page.goto("/editor?tool=ringtone");
  await expect(page.getByTestId("tool-link-intro")).toContainText("iPhone");
  await upload(page, TONE);

  const tile = tools(page).locator("[data-tool=ringtone]");
  await expect(tile).toHaveAttribute("data-highlighted", "true");
  await expect(tile.getByRole("checkbox", { name: "Ringtone mode" })).toBeChecked();
  await expect(tile.getByRole("button", { name: "iPhone (M4R)" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ringtone-warning")).toHaveCount(0); // 5 s is fine for iPhone

  const { name, bytes } = await download(page, () => page.getByRole("button", { name: "⬇ Export M4R" }).click());
  expect(name).toBe("tone-5s.m4r");
  expect(bytes.toString("latin1", 4, 8)).toBe("ftyp");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("keep mode: export length matches the kept region; one section exports on its own", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, SILENCE);

  // Switching with no regions needs no confirmation.
  await tools(page).getByRole("button", { name: "✓ Keep parts" }).click();
  await expect(page.getByTestId("mode-badge")).toHaveText("✓ KEEP MODE");
  await expect(page.getByRole("button", { name: "✓ Mark to Keep" })).toBeVisible();

  // N drops a 10 s keep region at the playhead (clamped to 0–8 s); type 2.0 → 5.5 s.
  await page.keyboard.press("n");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: /^Edit start time/ }).click();
  await page.getByRole("textbox", { name: "Start time" }).fill("2");
  await page.getByRole("textbox", { name: "Start time" }).press("Enter");
  await page.getByRole("button", { name: /^Edit end time/ }).click();
  await page.getByRole("textbox", { name: "End time" }).fill("5.5");
  await page.getByRole("textbox", { name: "End time" }).press("Enter");
  await expect(rows(page).first()).toHaveAttribute("aria-label", "Keep region 0:02.0 to 0:05.5");

  await tools(page).getByRole("button", { name: "WAV", exact: true }).click();
  const full = await download(page, () => page.getByRole("button", { name: "⬇ Export WAV" }).click());
  expect(full.name).toBe("tone-silence-8s.wav");
  expect(wavDuration(full.bytes)).toBeCloseTo(3.5, 2);

  const section = await download(page, () =>
    page.getByRole("button", { name: "Export this section 0:02.0 to 0:05.5" }).click());
  expect(section.name).toBe("tone-silence-8s-01.wav");
  expect(wavDuration(section.bytes)).toBeCloseTo(3.5, 2);
});

test("switching mode with regions asks first, converts, and undo switches back", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, TONE);
  await page.keyboard.press("n"); // 10 s cut at the playhead, clamped to 0–5 s; then typed 1–2 s
  await page.getByRole("button", { name: /^Edit start time/ }).click();
  await page.getByRole("textbox", { name: "Start time" }).fill("1");
  await page.getByRole("textbox", { name: "Start time" }).press("Enter");
  await page.getByRole("button", { name: /^Edit end time/ }).click();
  await page.getByRole("textbox", { name: "End time" }).fill("2");
  await page.getByRole("textbox", { name: "End time" }).press("Enter");
  await expect(rows(page)).toHaveCount(1);

  await tools(page).getByRole("button", { name: "✓ Keep parts" }).click();
  const dialog = page.getByRole("dialog", { name: /Switch to Keep mode/ });
  await expect(dialog).toBeVisible();
  // Esc cancels without changes.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("mode-badge")).toHaveText("✂ CUT MODE");

  await tools(page).getByRole("button", { name: "✓ Keep parts" }).click();
  await dialog.getByRole("button", { name: /Convert the regions/ }).click();
  await expect(page.getByTestId("mode-badge")).toHaveText("✓ KEEP MODE");
  const labels = () => rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await expect.poll(labels).toEqual(["Keep region 0:00.0 to 0:01.0", "Keep region 0:02.0 to 0:05.0"]);

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("mode-badge")).toHaveText("✂ CUT MODE");
  await expect.poll(labels).toEqual(["Cut 0:01.0 to 0:02.0"]);
});

test.describe("?tool= links preconfigure the editor", () => {
  const cases: { query: string; check: (page: Page) => Promise<void> }[] = [
    {
      query: "?tool=remove-silence",
      check: async (page) => {
        await expect(tools(page).locator("[data-tool=remove-silence]")).toHaveAttribute("data-highlighted", "true");
        const prompt = page.getByTestId("silence-prompt");
        await expect(prompt).toBeVisible();
        await expect(rows(page)).toHaveCount(0); // nothing runs on its own
        await prompt.getByRole("button", { name: "Detect silence" }).click();
        await expect(rows(page)).toHaveCount(2, { timeout: 3 * 60_000 });
        await expect(prompt).toBeHidden();
      },
    },
    {
      query: "?tool=normalize",
      check: async (page) => {
        await expect(tools(page).getByRole("checkbox", { name: "Normalize loudness" })).toBeChecked();
        await expect(tools(page).locator("[data-tool=normalize]")).toHaveAttribute("data-highlighted", "true");
      },
    },
    {
      query: "?tool=ringtone&device=android",
      check: async (page) => {
        await expect(tools(page).getByRole("button", { name: "Android (MP3)" })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "⬇ Export MP3" })).toBeVisible();
      },
    },
    {
      query: "?tool=convert&format=m4a",
      check: async (page) => {
        await expect(tools(page).locator("[data-tool=convert]")).toHaveAttribute("data-highlighted", "true");
        await expect(tools(page).getByRole("button", { name: "M4A", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "⬇ Export M4A" })).toBeVisible();
      },
    },
    {
      query: "?tool=keep",
      check: async (page) => {
        await expect(page.getByTestId("mode-badge")).toHaveText("✓ KEEP MODE");
        await expect(tools(page).locator("[data-tool=keep]")).toHaveAttribute("data-highlighted", "true");
      },
    },
    {
      query: "?tool=split",
      check: async (page) => {
        await expect(page.getByTestId("split-hint")).toBeVisible();
      },
    },
    {
      query: "?tool=not-a-tool",
      check: async (page) => {
        await expect(page.locator("[data-highlighted]")).toHaveCount(0);
        await expect(page.getByTestId("mode-badge")).toHaveText("✂ CUT MODE");
        await expect(page.getByRole("button", { name: "⬇ Export MP3" })).toBeVisible();
        await expect(tools(page).getByRole("checkbox", { name: "Normalize loudness" })).not.toBeChecked();
      },
    },
  ];

  for (const { query, check } of cases) {
    test(query, async ({ page }) => {
      await page.goto(`/editor${query}`);
      if (query.includes("not-a-tool")) await expect(page.getByTestId("tool-link-intro")).toHaveCount(0);
      else await expect(page.getByTestId("tool-link-intro")).toBeVisible({ timeout: 60_000 });
      await upload(page, SILENCE);
      await check(page);
    });
  }
});
