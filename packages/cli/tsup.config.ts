import { defineConfig } from "tsup";

export default defineConfig({
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  dts: { compilerOptions: { ignoreDeprecations: "6.0", types: ["node"] } },
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node22",
});
