#!/usr/bin/env bash
# Pre-commit / pre-push gate: typecheck + lint + format + tests across all
# workspaces, plus the generated-docs freshness and unused-code (knip) checks.
# Called by .githooks/pre-commit and .githooks/pre-push; agents should also run
# `npm run check` before committing.
# Emergency bypass: SKIP_CHECKS=1 (only with a real reason).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ "${SKIP_CHECKS:-0}" = "1" ]; then
  echo "check: SKIP_CHECKS=1 — skipping typecheck / lint / format / test / docs / knip"
  exit 0
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "-- npm install (root node_modules missing)"
  npm install --no-audit --no-fund
fi

echo "-- npm run check"
npm run check
