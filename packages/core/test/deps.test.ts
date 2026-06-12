import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = (p: string) => JSON.parse(readFileSync(join(root, p, "package.json"), "utf8"));

describe("dependency rules (spec §3)", () => {
  test("@saywhen/core has ZERO runtime dependencies", () => {
    const core = pkg("packages/core");
    expect(Object.keys(core.dependencies ?? {})).toEqual([]);
    expect(core.peerDependencies).toBeUndefined();
  });

  test("@saywhen/locale-en depends on core as a peer only", () => {
    const en = pkg("packages/locale-en");
    expect(Object.keys(en.dependencies ?? {})).toEqual([]);
    expect(Object.keys(en.peerDependencies ?? {})).toEqual(["@saywhen/core"]);
  });

  test("core source never imports from other packages", () => {
    // tsconfig lib already excludes DOM; this guards package boundaries
    const srcDir = join(root, "packages/core/src");
    for (const f of readdirSync(srcDir)) {
      const text = readFileSync(join(srcDir, f), "utf8");
      expect(text, `${f} must not import @saywhen/*`).not.toMatch(/from "@saywhen\//);
    }
  });
});
