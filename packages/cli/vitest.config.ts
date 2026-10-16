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
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.test.ts"],
  },
});
