# Agents

Guidance for automated contributions to `subconverter-ts`.

## Read this first

- Architecture and package map: [README.md](README.md).
- Dependency direction is enforced by ESLint (`@nx/enforce-module-boundaries`):
  `core` ← `node`/`browser` ← `cli`. Never let `core` import `node:*`, DOM globals, or another
  workspace package.
- The engine is a faithful port of tindy2013/subconverter. When porting a function, keep the
  C++ `file:line` reference in the commit/PR description and mirror its semantics exactly
  (including quirks — e.g. `!!TYPE=` uses full-match, `!!GROUP=` uses search).

## Commands

Run from the repo root:

| Task       | Command                                  |
| ---------- | ---------------------------------------- |
| Install    | `npm install`                            |
| Build      | `npm run build`                          |
| Typecheck  | `npm run typecheck`                      |
| Lint       | `npm run lint`                           |
| Lint (fix) | `npm run lint:fix`                       |
| Test       | `npm test`                               |
| Coverage   | `npm run test:coverage -w packages/core` |
| Format     | `npm run format`                         |
| Check      | `npm run check`                          |

Before committing: `npm run check` (typecheck + lint + test) must be green. The
`.githooks/pre-commit` and `pre-push` hooks run the same gate via
`docs/scripts/check.sh`; enable them once per clone with
`./docs/scripts/setup-git-hooks.sh`. Commit messages follow
[CONTRIBUTING.md](CONTRIBUTING.md) (Conventional Commits, enforced by the `commit-msg`
hook).

## Conventions (mirrors `code-kit` frontend)

- TypeScript strict; `verbatimModuleSyntax`; `consistent-type-imports` (inline `type`).
- Imports are **extensionless** (`moduleResolution: Bundler`).
- Re-exports are only allowed in a package `src/index.ts` (public API barrel).
- `max-len` 100; Prettier owns formatting; object keys sorted naturally
  (`perfectionist/sort-objects`).
- Tests live in `tests/**` (vitest); unit tests may also sit next to sources as `*.test.ts`.

## Testing requirements

- Unit, integration, and e2e coverage; keep lines/branches/functions above 90%.
- Add regression tests for every bug fix. Cross-check the upstream
  [issues](https://github.com/tindy2013/subconverter/issues) and
  [pulls](https://github.com/tindy2013/subconverter/pulls) for known edge cases.
- Prefer round-trip tests (`parse → generate → parse`) for generators.

## Layering rules in ESLint

- `no-restricted-syntax` bans re-exports and `.ts` import extensions outside barrels.
- `@nx/enforce-module-boundaries` enforces the tag graph declared in each
  package `package.json` `nx.tags`.
