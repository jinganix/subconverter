#!/usr/bin/env node
// Guard against documentation drift:
//
// 1. `docs/API.md` matches what the barrels and JSDoc produce.
// 2. Every `TargetFormat` / `ProxyType` member is documented in both READMEs,
//    so adding a target or protocol cannot silently leave the format lists stale
//    (the duplication the READMEs carry on purpose, because GitHub renders them
//    without the code).
//
// Run with `npm run docs:check`; it is part of `npm run check` and CI.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

/** Members of a TypeScript `enum` declared in `path`. */
async function enumMembers(path, name) {
  const source = await readFile(join(ROOT, path), "utf8");
  const block = new RegExp(`export enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!block) {
    throw new Error(`enum ${name} not found in ${path}`);
  }
  return [...block[1].matchAll(/^\s*(\w+) = "([^"]+)"/gm)].map(([, , value]) => value);
}

const CHECKS = [
  {
    documented: "output targets",
    enumName: "TargetFormat",
    path: "packages/core/src/types/settings.ts",
    skip: [],
  },
  {
    documented: "node protocols",
    enumName: "ProxyType",
    path: "packages/core/src/types/proxy.ts",
    // `unknown` is the internal sentinel for unparsable input, not a protocol.
    skip: ["unknown"],
  },
];

const READMES = ["README.md", "README.zh-CN.md"];

async function checkEnumCoverage() {
  const failures = [];
  for (const check of CHECKS) {
    const members = (await enumMembers(check.path, check.enumName)).filter(
      (member) => !check.skip.includes(member),
    );
    for (const readme of READMES) {
      const text = await readFile(join(ROOT, readme), "utf8");
      for (const member of members) {
        if (!text.includes(`\`${member}\``)) {
          failures.push(`${readme}: ${check.documented} missing \`${member}\``);
        }
      }
    }
  }
  return failures;
}

async function main() {
  const failures = [];

  try {
    await run(process.execPath, [join(ROOT, "scripts/gen-api-docs.mjs"), "--check"], {
      cwd: ROOT,
    });
  } catch (error) {
    failures.push(error.stderr?.trim() || error.message);
  }

  failures.push(...(await checkEnumCoverage()));

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    console.error(
      "\nDocs are stale. Run `npm run docs:api` for docs/API.md and update the README\n" +
        "format/protocol lists when public enums change.",
    );
    process.exit(1);
  }
  console.log("Docs are up to date.");
}

await main();
