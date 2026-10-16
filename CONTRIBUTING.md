# Contributing to subconverter-ts

## Commit messages (Conventional Commits)

This repository uses [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

[optional body — explain why, not what]
```

- **subject**: imperative mood, short; the first line (header) must be ≤ 100 characters.
- **scope**: optional, see the table below.
- Merge PR titles should follow the same format.

### type

| type       | When to use                                   |
| ---------- | --------------------------------------------- |
| `feat`     | New feature, parser, generator, or helper.    |
| `fix`      | Bug fix.                                      |
| `docs`     | Documentation only.                           |
| `style`    | Formatting, no semantic change.               |
| `refactor` | Structural change without external behavior.  |
| `perf`     | Performance work.                             |
| `test`     | Tests only.                                   |
| `build`    | Build tooling, tsconfig, tsup, deps versions. |
| `ci`       | CI, git hooks, gate scripts.                  |
| `chore`    | Maintenance that fits nothing above.          |
| `revert`   | Revert a previous commit.                     |

### scope (this repository)

| scope     | Path / content                                                             |
| --------- | -------------------------------------------------------------------------- |
| `core`    | `packages/core` — platform-free conversion engine.                         |
| `node`    | `packages/node` — Node adapter (fs + fetch).                               |
| `browser` | `packages/browser` — ESM + IIFE browser build.                             |
| `cli`     | `packages/cli` — `subconverter` command-line interface.                    |
| `docs`    | `README.md`, `README.zh-CN.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/**`. |
| `deps`    | Dependency version upgrades (`package.json`, `package-lock.json`).         |
| `build`   | Build/TS tooling: `tsconfig*.json`, `tsup`, `eslint.config.js`, prettier.  |
| `ci`      | `.githooks/**`, `docs/scripts/**` (gate scripts).                          |

Large changes may be split into several commits; each commit picks its most relevant scope.

### Examples

```
feat(core): add sing-box outbound generator

fix(node): resolve bases rulesets relative to the config file

docs(docs): document the CLI convert flags
```

## Local validation (shell hooks)

Run once after cloning or when hooks change:

```bash
./docs/scripts/setup-git-hooks.sh
```

Try the message validator directly:

```bash
echo "feat(core): test message" | ./docs/scripts/validate-commit-msg.sh /dev/stdin
```

**Commit/push gate**: `pre-commit` and `pre-push` both run `docs/scripts/check.sh`,
which installs dependencies if needed and runs `npm run check`
(typecheck + lint + tests across all workspaces):

```bash
./docs/scripts/check.sh              # the same gate, manually
SKIP_CHECKS=1 ./docs/scripts/check.sh  # emergency bypass (real reason only)
```

Direct commits and pushes to `master` are blocked by the hooks — open a branch first.

**Note:** this repo uses a single shell `commit-msg` hook
(`.githooks/commit-msg` → `docs/scripts/validate-commit-msg.sh`). Do not add a second
validation layer (husky / commitlint / `.husky/` / a root `prepare` script).

## Conventions

Code style, layering rules, and testing requirements live in [AGENTS.md](AGENTS.md).

## License

By contributing you agree that your contributions are licensed under GPL-3.0,
matching the upstream project.
