import { expect, test } from "@playwright/test";
import { editorHref, tools } from "../lib/tools";

/**
 * Feature landing pages (app/[tool]/page.tsx): each renders server-side with one H1, its
 * title, a canonical URL, parseable JSON-LD and a CTA that preselects the right editor tool.
 * The CTA is checked, not followed (the editor has its own specs).
 */

for (const tool of tools) {
  test(`/${tool.slug} renders with H1, CTA and JSON-LD`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    const res = await page.goto(`/${tool.slug}`);
    expect(res?.status()).toBe(200);

    await expect(page).toHaveTitle(tool.title);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(tool.h1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", tool.description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${tool.slug}$`));

    const cta = page.getByTestId("tool-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", editorHref(tool.editor));

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = ld.map((s) => (JSON.parse(s) as { "@type": string })["@type"]);
    expect(types).toEqual(expect.arrayContaining(["HowTo", "FAQPage"]));

    // Steps and FAQ are server-rendered text, not hidden behind client JS.
    for (const s of tool.steps) await expect(page.getByRole("heading", { name: s.name, exact: true })).toBeVisible();
    for (const f of tool.faqs) await expect(page.getByRole("heading", { name: f.q, exact: true })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
}

test("home page links to every tool page", async ({ page }) => {
  await page.goto("/");
  const tools_ = page.locator("#tools");
  for (const tool of tools) {
    await expect(tools_.locator(`a[href="/${tool.slug}"]`)).toHaveCount(1);
    await expect(page.locator(`footer a[href="/${tool.slug}"]`)).toHaveCount(1);
  }
});

test("unknown top-level paths are 404", async ({ page }) => {
  const res = await page.goto("/not-a-real-tool-page");
  expect(res?.status()).toBe(404);
});
