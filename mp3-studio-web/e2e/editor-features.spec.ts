import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Editor features beyond the smoke test: keyboard shortcuts, typed-in region times,
 * region play/loop and session auto-save. Every test gets a fresh browser context, so
 * localStorage starts empty.
 */

const FIXTURE = path.join(__dirname, "fixtures", "tone-5s.mp3"); // 5 s 440 Hz sine

async function uploadFixture(page: Page) {
  const browse = page.getByRole("button", { name: "Browse files" });
  await expect(browse).toBeVisible({ timeout: 60_000 }); // editor is lazy-loaded (ssr: false)
  const chooserPromise = page.waitForEvent("filechooser");
  await browse.click();
  await (await chooserPromise).setFiles(FIXTURE);
  // Enabled once WaveSurfer has decoded the audio (duration > 0).
  await expect(page.getByRole("button", { name: /Mark to Cut/ })).toBeEnabled();
}

const cutCount = (page: Page, n: number) => page.getByText(`(${n})`, { exact: true }).first();
const regionTimes = (page: Page) => page.getByTestId("region-list").getByText(/^\d+:\d{2}\.\d → \d+:\d{2}\.\d$/);

test.beforeEach(async ({ page }) => {
  await page.goto("/editor");
  await uploadFixture(page);
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();
});

test("N creates a cut, Ctrl+Z removes it, Ctrl+Y brings it back", async ({ page }) => {
  await page.keyboard.press("n");
  await expect(cutCount(page, 1)).toBeVisible();
  // Playhead at 0 → a 10 s cut centered on it, clamped to the 5 s file.
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:05.0");

  await page.keyboard.press("Control+z");
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();

  await page.keyboard.press("Control+y");
  await expect(cutCount(page, 1)).toBeVisible();
  await page.keyboard.press("Control+Shift+z"); // nothing left to redo: no change
  await expect(cutCount(page, 1)).toBeVisible();

  // Shortcuts are ignored while typing in a text field.
  await page.getByRole("textbox").first().focus();
  await page.keyboard.press("n");
  await expect(cutCount(page, 1)).toBeVisible();
});

test("typing a time edits a region (one undo step), invalid input is rejected", async ({ page }) => {
  await page.keyboard.press("n");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:05.0");

  await page.getByRole("button", { name: /^Edit end time/ }).click();
  const endInput = page.getByRole("textbox", { name: "End time" });
  await expect(endInput).toHaveValue("0:05.000");
  await endInput.fill("0:03.25");
  await endInput.press("Enter");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:03.2");

  await page.getByRole("button", { name: /^Edit start time/ }).click();
  const startInput = page.getByRole("textbox", { name: "Start time" });
  await startInput.fill("1.5");
  await startInput.press("Enter");
  await expect(regionTimes(page)).toHaveText("0:01.5 → 0:03.2");

  // Start after end → stays open, marked invalid; Esc cancels.
  await page.getByRole("button", { name: /^Edit start time/ }).click();
  await startInput.fill("4");
  await startInput.press("Enter");
  await expect(startInput).toHaveAttribute("aria-invalid", "true");
  await startInput.fill("nonsense");
  await startInput.press("Enter");
  await expect(startInput).toHaveAttribute("aria-invalid", "true");
  await startInput.press("Escape");
  await expect(startInput).toBeHidden();
  await expect(regionTimes(page)).toHaveText("0:01.5 → 0:03.2");

  // Each committed edit was one history entry.
  await page.keyboard.press("Control+z");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:03.2");
  await page.keyboard.press("Control+z");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:05.0");
});

test("Delete on a focused region row removes it", async ({ page }) => {
  await page.keyboard.press("n");
  const row = page.getByTestId("region-list").locator("[data-region-row]");
  await row.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();
});

test("play a region stops at its end; loop repeats until L", async ({ page }) => {
  await page.keyboard.press("n");
  await page.getByRole("button", { name: /^Edit end time/ }).click();
  await page.getByRole("textbox", { name: "End time" }).fill("0.8");
  await page.keyboard.press("Enter");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:00.8");

  const list = page.getByTestId("region-list");
  await list.getByRole("button", { name: /^Play cut/ }).click();
  await expect(list.getByRole("button", { name: /^Stop cut/ })).toBeVisible();
  // Stops by itself at the end of the region, with the playhead there.
  await expect(list.getByRole("button", { name: /^Play cut/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

  const loop = list.getByRole("button", { name: /^Loop cut/ });
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(2000); // > 2 passes through the 0.8 s region
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await page.keyboard.press("l");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("? opens the shortcuts overlay; Esc closes overlay, then fullscreen", async ({ page }) => {
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("n"); // other shortcuts are off while the overlay is open
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Fullscreen waveform" })).toBeVisible();

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.getByRole("button", { name: "Close keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
});

test("P opens the preview; Space there doesn't reach the editor; Esc closes it", async ({ page }) => {
  const mark = page.getByRole("button", { name: /Mark to Cut/ });
  await mark.click();
  await expect(cutCount(page, 1)).toBeVisible();
  // The 10 s cut covers the whole 5 s file (nothing left to preview) — shorten it.
  await page.getByRole("button", { name: /^Edit end time/ }).click();
  await page.getByRole("textbox", { name: "End time" }).fill("1");
  await page.keyboard.press("Enter");
  await expect(regionTimes(page)).toHaveText("0:00.0 → 0:01.0");
  await mark.focus(); // focus on a button behind the modal-to-be

  await page.keyboard.press("p");
  const modal = page.getByTestId("preview-modal");
  await expect(modal).toBeVisible({ timeout: 2 * 60_000 }); // first run loads the FFmpeg core
  await page.keyboard.press(" ");
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(cutCount(page, 1)).toBeVisible(); // neither Space nor N added a cut
  await expect(mark).toBeFocused();              // focus is given back
});

test("reload + same file restores the cuts; Clear removes them (undoable)", async ({ page }) => {
  await page.keyboard.press("n");
  await page.getByRole("button", { name: /^Edit start time/ }).click();
  await page.getByRole("textbox", { name: "Start time" }).fill("1.5");
  await page.keyboard.press("Enter");
  await expect(regionTimes(page)).toHaveText("0:01.5 → 0:05.0");

  await page.reload();
  await uploadFixture(page);

  const toast = page.getByTestId("toast-info").filter({ hasText: "Restored 1 cut from your last session" });
  await expect(toast).toBeVisible();
  await expect(regionTimes(page)).toHaveText("0:01.5 → 0:05.0");
  // Restoring adds no history entry.
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();

  await toast.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(regionTimes(page)).toHaveText("0:01.5 → 0:05.0");

  // Clearing everything forgets the session.
  await page.getByRole("button", { name: /Reset/ }).click();
  await page.reload();
  await uploadFixture(page);
  await expect(page.getByText(/No cuts yet/).first()).toBeVisible();
  await expect(page.getByTestId("toast-info")).toHaveCount(0);
});
