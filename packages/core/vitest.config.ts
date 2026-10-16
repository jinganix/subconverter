import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/*-types.ts",
        "src/types/**",
        "src/index.ts",
      ],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.test.ts"],
  },
});
