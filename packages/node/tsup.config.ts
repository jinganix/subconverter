import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: { compilerOptions: { ignoreDeprecations: "6.0", types: ["node"] } },
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node22",
});
