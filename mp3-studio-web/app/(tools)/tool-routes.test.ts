import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tools } from "@/lib/tools";

// Each tool page has a static route folder app/(tools)/<slug>/ whose page.tsx names its slug.
const dir = path.join(__dirname);
const folders = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory());

describe("tool page routes", () => {
  it("there is one route folder per tool and no extra ones", () => {
    expect(folders.sort()).toEqual(tools.map((t) => t.slug).sort());
  });

  it.each(tools.map((t) => [t.slug] as const))("%s/page.tsx renders its own slug", (slug) => {
    const file = path.join(dir, slug, "page.tsx");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain(`const SLUG = "${slug}";`);
  });
});
