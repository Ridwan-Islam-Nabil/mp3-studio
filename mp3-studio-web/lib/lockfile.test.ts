import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards against an npm bug: `npm install` on Windows can drop lockfile entries that only
 * matter on other platforms (e.g. `@emnapi/core` / `@emnapi/runtime`, needed by the wasm32
 * builds of Tailwind and sharp). Windows keeps working, but `npm ci` on Linux CI then fails
 * with "Missing: … from lock file". This test fails locally first, before a push.
 *
 * Fix: delete package-lock.json, run `npm install --package-lock-only`, then `npm ci`.
 */

type LockPackage = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const lock = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package-lock.json", import.meta.url)), "utf8"),
) as { packages: Record<string, LockPackage> };

/** Node-style lookup: walk up the node_modules folders from `from`. */
function resolves(from: string, name: string): boolean {
  let base = from;
  for (;;) {
    if (`${base ? `${base}/` : ""}node_modules/${name}` in lock.packages) return true;
    if (!base) return false;
    const i = base.lastIndexOf("/node_modules/");
    base = i >= 0 ? base.slice(0, i) : "";
  }
}

describe("package-lock.json", () => {
  it("has an entry for every dependency on every platform (npm ci on Linux CI needs it)", () => {
    const missing: string[] = [];
    for (const [path, pkg] of Object.entries(lock.packages)) {
      const required = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}).filter((n) => !pkg.peerDependenciesMeta?.[n]?.optional),
      ];
      for (const name of required) if (!resolves(path, name)) missing.push(`${path || "(root)"} → ${name}`);
    }
    expect(missing).toEqual([]);
  });
});
