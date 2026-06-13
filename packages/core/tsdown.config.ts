import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/suggest.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  fixedExtension: false, // package is type:module → emit .js/.d.ts
});
