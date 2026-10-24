#!/usr/bin/env node
// Verify what each publishable package would actually ship.
//
// npm always includes a package-level `README.md` and `LICENSE` when they exist,
// but it does not walk up the monorepo: 0.1.0 shipped with neither, so npmjs.com
// showed "This package does not have a README". This check fails when a package
// is missing its README/LICENSE, or when the build output referenced by
// `main`/`types`/`bin` is absent from the tarball.
//
// Run with `npm run check:packages` (needs `dist/`, so build first). CI runs it
// after the build step; it is intentionally not part of the fast `npm run check`.

import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const WORKSPACES = ["packages/core", "packages/node", "packages/browser", "packages/cli"];

/** Files the npm registry page and license compliance depend on. */
const REQUIRED = ["README.md", "LICENSE", "package.json"];

/**
 * File paths from `npm pack --dry-run --json`.
 *
 * npm <= 11 prints an array of pack results; npm >= 12 prints an object keyed by
 * package name. Read both so the check does not break when CI upgrades npm
 * (`npm install -g npm@latest` in the release workflow).
 */
function packFiles(payload) {
  const results = Array.isArray(payload) ? payload : Object.values(payload ?? {});
  const result = results.find((entry) => Array.isArray(entry?.files));
  if (!result) {
    throw new Error("unexpected npm pack --json output");
  }
  return result.files.map((file) => file.path);
}

/** Entry points declared in package.json that must exist inside the tarball. */ function declaredEntries(
  pkg,
) {
  const entries = new Set();
  for (const field of ["main", "module", "types"]) {
    if (typeof pkg[field] === "string") entries.add(pkg[field]);
  }
  if (typeof pkg.bin === "string") entries.add(pkg.bin);
  if (pkg.bin && typeof pkg.bin === "object") {
    for (const value of Object.values(pkg.bin)) entries.add(value);
  }
  for (const value of Object.values(pkg.exports ?? {})) {
    if (typeof value === "string") entries.add(value);
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        if (typeof nested === "string") entries.add(nested);
      }
    }
  }
  return [...entries].map((entry) => entry.replace(/^\.\//, ""));
}

const failures = [];

// npm does not read files outside the package directory, so each package carries
// its own LICENSE copy. Keep them byte-identical to the root license.
const rootLicense = await readFile(join(ROOT, "LICENSE"), "utf8").catch(() => null);
if (rootLicense === null) {
  failures.push("repository root is missing LICENSE");
}

for (const workspace of WORKSPACES) {
  const dir = join(ROOT, workspace);
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));

  for (const file of REQUIRED) {
    try {
      await access(join(dir, file));
    } catch {
      failures.push(`${pkg.name}: missing ${file} (npm would publish without it)`);
    }
  }

  if (rootLicense !== null) {
    const localLicense = await readFile(join(dir, "LICENSE"), "utf8").catch(() => null);
    if (localLicense !== null && localLicense !== rootLicense) {
      failures.push(`${pkg.name}: LICENSE differs from the repository root LICENSE`);
    }
  }

  // A README that is empty or a stub is as bad as a missing one.
  const readme = await readFile(join(dir, "README.md"), "utf8").catch(() => "");
  if (readme.trim() !== "" && !readme.includes(pkg.name)) {
    failures.push(`${pkg.name}: README.md does not mention the package name`);
  }

  let files;
  try {
    const { stdout } = await run("npm", ["pack", "--dry-run", "--json"], { cwd: dir });
    files = packFiles(JSON.parse(stdout));
  } catch (error) {
    failures.push(`${pkg.name}: npm pack --dry-run failed: ${error.message}`);
    continue;
  }

  const shipped = new Set(files);
  for (const file of REQUIRED) {
    if (!shipped.has(file)) {
      failures.push(`${pkg.name}: ${file} is not in the tarball`);
    }
  }
  for (const entry of declaredEntries(pkg)) {
    if (!shipped.has(entry)) {
      failures.push(`${pkg.name}: declared entry ${entry} is not in the tarball`);
    }
  }
  if (!pkg.license) {
    failures.push(`${pkg.name}: package.json has no license field`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  console.error(
    `\nPackage artifacts are incomplete (${relative(ROOT, process.cwd()) || "."}). ` +
      "Add the missing files and rebuild before publishing.",
  );
  process.exit(1);
}

console.log("Package artifacts are complete (README, LICENSE, and entry points).");
