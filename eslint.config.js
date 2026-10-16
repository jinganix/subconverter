import eslint from "@eslint/js";
import nxEslintPlugin from "@nx/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { importX } from "eslint-plugin-import-x";
import perfectionist from "eslint-plugin-perfectionist";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

const NO_IMPORT_EXTENSION_MESSAGE =
  "Import specifiers MUST be extensionless: no .ts (moduleResolution=Bundler resolves them).";

export default [
  {
    ignores: ["**/build/**", "**/dist/**", "**/coverage/**", "**/node_modules/**", "**/.tmp/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
    },
    plugins: {
      "@nx": nxEslintPlugin,
      "import-x": importX,
      perfectionist,
    },
    rules: {
      // Layering direction: core <- node/browser <- cli. core is platform-free
      // (no node builtins, no DOM); adapters depend on core only; cli may depend
      // on everything. Tags are declared in each package's package.json `nx`.
      "@nx/enforce-module-boundaries": [
        "error",
        {
          allow: [],
          allowCircularSelfDependency: true,
          depConstraints: [
            {
              onlyDependOnLibsWithTags: ["scope:core", "scope:test-support"],
              sourceTag: "scope:core",
            },
            {
              onlyDependOnLibsWithTags: ["scope:core", "scope:test-support"],
              sourceTag: "scope:node",
            },
            {
              onlyDependOnLibsWithTags: ["scope:core", "scope:test-support"],
              sourceTag: "scope:browser",
            },
            {
              onlyDependOnLibsWithTags: [
                "scope:core",
                "scope:node",
                "scope:browser",
                "scope:test-support",
              ],
              sourceTag: "scope:cli",
            },
            {
              onlyDependOnLibsWithTags: ["scope:test-support"],
              sourceTag: "scope:test-support",
            },
          ],
          enforceBuildableLibDependency: false,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
      "import-x/newline-after-import": "error",
      "import-x/order": [
        "error",
        {
          alphabetize: { caseInsensitive: true, order: "asc" },
          groups: [["builtin", "external"], "internal", ["index", "parent", "sibling"]],
        },
      ],
      "max-len": [
        "error",
        { code: 100, ignoreStrings: true, ignoreUrls: true, ignoreTemplateLiterals: true },
      ],
      "no-useless-assignment": "off",
      "no-restricted-syntax": [
        "error",
        {
          message: "Re-export is prohibited; import directly from the defining module.",
          selector: "ExportAllDeclaration",
        },
        {
          message: "Re-export is prohibited; import directly from the defining module.",
          selector: "ExportNamedDeclaration[source]",
        },
        {
          message: NO_IMPORT_EXTENSION_MESSAGE,
          selector: "ImportDeclaration[source.value=/\\.ts$/]",
        },
        {
          message: NO_IMPORT_EXTENSION_MESSAGE,
          selector: "ExportNamedDeclaration[source.value=/\\.ts$/]",
        },
        {
          message: NO_IMPORT_EXTENSION_MESSAGE,
          selector: "ExportAllDeclaration[source.value=/\\.ts$/]",
        },
        {
          message: NO_IMPORT_EXTENSION_MESSAGE,
          selector: "ImportExpression[source.value=/\\.ts$/]",
        },
      ],
      "perfectionist/sort-objects": ["error", { ignoreCase: true, order: "asc", type: "natural" }],
      semi: "off",
      "sort-keys": "off",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
    },
  },
  {
    // Config files re-export a shared base by design.
    files: ["**/eslint.config.js", "**/.prettierrc.js", "**/.prettierrc.cjs", "**/.prettierrc.mjs"],
    rules: {
      "@nx/enforce-module-boundaries": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    // Package barrel files exist purely to expose the public API; the re-export
    // ban targets internal source files, not the intentional entry point.
    files: ["**/src/index.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  eslintPluginPrettierRecommended,
];
