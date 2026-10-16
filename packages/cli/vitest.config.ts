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
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.test.ts"],
  },
});
