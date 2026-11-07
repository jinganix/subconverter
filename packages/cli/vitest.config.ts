import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@subconverter/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@subconverter/node": fileURLToPath(new URL("../node/src/index.ts", import.meta.url)),
    },
  },
  test: {
    coverage: {
      // `src/cli.ts` is the bin shim: it runs `runCli(process.argv)` at import
      // time and exits via `process.exitCode`, so it cannot be covered in-process.
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/cli.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.test.ts"],
  },
});
