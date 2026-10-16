import { defineConfig } from "tsup";

export default defineConfig([
  {
    clean: true,
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    entry: { index: "src/index.ts" },
    format: ["esm"],
    outDir: "dist",
    platform: "browser",
    sourcemap: true,
    target: "es2022",
  },
  {
    entry: { subconverter: "src/global.ts" },
    format: ["iife"],
    globalName: "SubConverter",
    minify: true,
    outDir: "dist",
    platform: "browser",
    sourcemap: true,
    target: "es2022",
  },
]);
