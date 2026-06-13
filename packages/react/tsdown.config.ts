import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  external: ["react", /^@saywhen\//], // keep react + every @saywhen/* subpath (incl. /controller) external
  fixedExtension: false, // package is type:module → emit .js/.d.ts
});
