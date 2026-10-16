import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPkgPath = join(repoRoot, "package.json");
const lockPath = join(repoRoot, "package-lock.json");
const workspaceDirs = ["packages/core", "packages/node", "packages/browser", "packages/cli"];
const internalDeps = ["@subconverter/core", "@subconverter/node"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let release = null;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--release" && args[index + 1]) {
      release = args[++index];
    } else if (args[index] === "--help" || args[index] === "-h") {
      console.log("usage: node scripts/sync-versions.mjs [--release x.y.z]");
      process.exit(0);
    } else {
      throw new Error(`sync-versions: unknown arg ${args[index]}`);
    }
  }
  if (release !== null && !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release)) {
    throw new Error(`sync-versions: invalid version ${release}, want x.y.z`);
  }
  return { release };
}

function setVersion(pkg, version) {
  if (pkg.version === version) {
    return false;
  }
  pkg.version = version;
  return true;
}

function pinInternalDeps(pkg, version) {
  let changed = false;
  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[section];
    if (deps === undefined) {
      continue;
    }
    for (const name of internalDeps) {
      if (deps[name] !== undefined && deps[name] !== version) {
        deps[name] = version;
        changed = true;
      }
    }
  }
  return changed;
}

const { release } = parseArgs();
const rootPkg = readJson(rootPkgPath);
const target = release ?? rootPkg.version;

if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(target)) {
  throw new Error(`sync-versions: invalid target version ${target}, want x.y.z`);
}

let changed = false;
if (setVersion(rootPkg, target)) {
  changed = true;
}
writeJson(rootPkgPath, rootPkg);

for (const dir of workspaceDirs) {
  const path = join(repoRoot, dir, "package.json");
  const pkg = readJson(path);
  if (setVersion(pkg, target)) {
    changed = true;
  }
  if (release !== null && pinInternalDeps(pkg, target)) {
    changed = true;
  }
  writeJson(path, pkg);
}

const lock = readJson(lockPath);
if (lock.version !== target) {
  lock.version = target;
  changed = true;
}
const packages = lock.packages ?? {};
for (const key of ["", ...workspaceDirs]) {
  if (packages[key] !== undefined && packages[key].version !== target) {
    packages[key].version = target;
    changed = true;
  }
}
if (release !== null) {
  for (const key of workspaceDirs) {
    const entry = packages[key];
    if (entry === undefined) {
      continue;
    }
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = entry[section];
      if (deps === undefined) {
        continue;
      }
      for (const name of internalDeps) {
        if (deps[name] !== undefined && deps[name] !== target) {
          deps[name] = target;
          changed = true;
        }
      }
    }
  }
}
writeJson(lockPath, lock);

console.log(
  changed ? `sync-versions: ${target} (updated)` : `sync-versions: ${target} (unchanged)`,
);
