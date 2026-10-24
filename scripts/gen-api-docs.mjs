#!/usr/bin/env node
// Generate docs/API.md from the public barrels (packages/*/src/index.ts).
//
// The barrel is the single source of truth for the public API: this script
// resolves every re-exported symbol back to its declaring file using the
// TypeScript compiler API, then renders each declaration's JSDoc, signature,
// enum members, and interface fields. Run `npm run docs:api` after changing a
// barrel or a documented signature; `npm run docs:check` (part of
// `npm run check`) fails when the file on disk is stale.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "docs/API.md");

const PACKAGES = [
  {
    name: "@subconverter/core",
    dir: "packages/core",
    intro:
      "Platform-free conversion engine: parsers, generators, node manipulation, settings, and rulesets.",
  },
  {
    name: "@subconverter/node",
    dir: "packages/node",
    intro:
      "Node.js adapter: `fetch`/`fs` loading, GeoIP country lookup, and the `/sub` HTTP server.",
  },
  {
    name: "@subconverter/browser",
    dir: "packages/browser",
    intro: "Browser build: ESM plus the IIFE global `SubConverter`.",
  },
  { name: "@subconverter/cli", dir: "packages/cli", intro: "Command-line interface." },
];

const KINDS = {
  [ts.SyntaxKind.ClassDeclaration]: "class",
  [ts.SyntaxKind.EnumDeclaration]: "enum",
  [ts.SyntaxKind.FunctionDeclaration]: "function",
  [ts.SyntaxKind.InterfaceDeclaration]: "interface",
  [ts.SyntaxKind.TypeAliasDeclaration]: "type",
  [ts.SyntaxKind.VariableStatement]: "const",
};

/** JSDoc text as trimmed lines, with `{@link X}` flattened to `` `X` ``. */
function docLines(node) {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  if (docs.length === 0) {
    return [];
  }
  const doc = docs[docs.length - 1];
  const inner = doc
    .getText()
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\/\*\*\s?/, "")
        .replace(/\s*\*\/\s*$/, "")
        .replace(/^\s*\*\s?/, "")
        .replace(/\s+$/, "")
        .replace(/\{\s*@link\s+([^}]+)\s*\}/g, "`$1`"),
    );
  while (inner.length > 0 && inner[0] === "") inner.shift();
  while (inner.length > 0 && inner[inner.length - 1] === "") inner.pop();
  return inner;
}

/** Source text without the `export` keyword or a trailing body/terminator. */
function signatureOf(node, stopAt) {
  const source = node.getSourceFile().text;
  const end = stopAt ?? node.getEnd();
  return source
    .slice(node.getStart(), end)
    .replace(/^export\s+/, "")
    .replace(/\s+$/, "")
    .replace(/[;{]\s*$/, "");
}

function interfaceMembers(node) {
  const members = [];
  for (const member of node.members) {
    if (ts.isPropertySignature(member)) {
      members.push({
        doc: docLines(member),
        name: member.name.getText(),
        optional: member.questionToken !== undefined,
        type: member.type ? member.type.getText() : "unknown",
      });
    } else if (ts.isMethodSignature(member)) {
      members.push({
        doc: docLines(member),
        name: member.name.getText(),
        optional: member.questionToken !== undefined,
        type: `(${member.parameters.map((parameter) => parameter.getText()).join(", ")}) => ${
          member.type?.getText() ?? "unknown"
        }`,
      });
    }
  }
  return members;
}

function enumMembers(node) {
  return node.members.map((member) => ({
    name: member.name.getText(),
    value: member.initializer?.getText() ?? "",
  }));
}

/** Index a source file's top-level exported declarations by name. */
function scanDeclarations(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  for (const statement of file.statements) {
    let name;
    let kind = KINDS[statement.kind];
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations[0];
      if (!ts.isIdentifier(declaration.name)) continue;
      name = declaration.name.text;
    } else {
      if (!statement.name || !ts.isIdentifier(statement.name)) continue;
      name = statement.name.text;
      if (ts.isFunctionDeclaration(statement) && statement.body) {
        kind = "function";
      }
    }
    if (!kind) continue;
    // Only exported statements are part of the public surface.
    const exported = ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;

    const entry = { doc: docLines(statement), kind, signature: signatureOf(statement) };
    if (kind === "function" && statement.body) {
      entry.signature = signatureOf(statement, statement.body.getStart()).replace(/[;{]\s*$/, "");
    }
    if (kind === "interface") {
      entry.signature = `interface ${name}`;
      entry.members = interfaceMembers(statement);
    }
    if (kind === "enum") {
      entry.members = enumMembers(statement);
      entry.signature = `enum ${name}`;
    }
    if (kind === "class") {
      entry.signature = `class ${name}`;
    }
    declarations.set(name, entry);
  }
  return declarations;
}

/** Parse a barrel: `export { a, b as c, type D } from "./x"` statements. */
function parseBarrel(source) {
  const modules = [];
  const pattern = /export\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const names = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const cleaned = entry.replace(/^type\s+/, "");
        const [local, exported] = cleaned.split(/\s+as\s+/);
        return exported ?? local;
      });
    modules.push({ names, specifier: match[2] });
  }
  return modules;
}

async function collectPackage(pkg) {
  const barrelPath = join(ROOT, pkg.dir, "src/index.ts");
  const barrel = await readFile(barrelPath, "utf8");
  const groups = [];
  const local = scanDeclarations(barrel, barrelPath);
  if (local.size > 0) {
    groups.push({
      entries: [...local.entries()].map(([name, declaration]) => ({ name, ...declaration })),
      source: "./src/index.ts",
      title: "(entry point)",
    });
  }
  for (const moduleRef of parseBarrel(barrel)) {
    if (!moduleRef.specifier.startsWith(".")) {
      // Cross-package re-export (e.g. browser re-exports core): documented once,
      // under the package that declares the symbol.
      continue;
    }
    const sourcePath = join(ROOT, pkg.dir, "src", `${moduleRef.specifier}.ts`);
    const source = await readFile(sourcePath, "utf8");
    const declarations = scanDeclarations(source, sourcePath);
    const entries = [];
    for (const name of moduleRef.names) {
      const declaration = declarations.get(name);
      if (!declaration) {
        throw new Error(`${pkg.name}: ${name} is exported but not found in ${sourcePath}`);
      }
      entries.push({ name, ...declaration });
    }
    if (entries.length > 0) {
      groups.push({
        entries,
        source: `./${relative(join(ROOT, pkg.dir), sourcePath)}`,
        title: moduleRef.specifier.replace(/^\.\//, ""),
      });
    }
  }
  return groups;
}

function renderDoc(doc) {
  return doc.length === 0 ? [] : [...doc.map((line) => (line === "" ? ">" : `> ${line}`)), ""];
}

function renderEntry(entry) {
  const out = [`#### \`${entry.name}\` (${entry.kind})`, "", ...renderDoc(entry.doc)];
  if (entry.kind === "enum") {
    out.push("| Member | Value |", "| --- | --- |");
    for (const member of entry.members) {
      out.push(`| \`${member.name}\` | \`${member.value}\` |`);
    }
    out.push("");
    return out;
  }
  out.push("```ts", entry.signature, "```", "");
  if (entry.members && entry.members.length > 0) {
    out.push("Members:", "");
    for (const member of entry.members) {
      const notes = member.doc.join(" ").replace(/\s+/g, " ").trim();
      const optionality = member.optional ? "optional" : "required";
      out.push(
        `- \`${member.name}\` (\`${member.type}\`, ${optionality})${notes ? ` — ${notes}` : ""}`,
      );
    }
    out.push("");
  }
  return out;
}

function anchor(text) {
  return text
    .toLowerCase()
    .replace(/[`@/.]/g, "")
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

function render(packages) {
  const lines = [
    "# API reference",
    "",
    "Generated from the public barrels (`packages/*/src/index.ts`) by",
    "`scripts/gen-api-docs.mjs`. Do not edit by hand: run `npm run docs:api`.",
    "",
    "Every symbol below is a supported public entry point; anything not listed here",
    "is internal and may change between minor releases.",
    "",
    "## Packages",
    "",
  ];
  for (const pkg of packages) {
    lines.push(`- [\`${pkg.name}\`](#${anchor(pkg.name)}) — ${pkg.intro}`);
  }
  lines.push("");
  for (const pkg of packages) {
    lines.push(`## ${pkg.name}`, "", pkg.intro, "");
    lines.push(`Builds from: [\`${pkg.dir}/src/index.ts\`](../${pkg.dir}/src/index.ts).`, "");
    if (pkg.groups.length === 0) {
      lines.push("_No additional public exports._", "");
      continue;
    }
    lines.push("Modules:", "");
    for (const group of pkg.groups) {
      const symbols = group.entries.map((entry) => `\`${entry.name}\``).join(", ");
      lines.push(`- [\`${group.title}\`](#${anchor(`${pkg.name}-${group.title}`)}): ${symbols}`);
    }
    lines.push("");
    for (const group of pkg.groups) {
      lines.push(
        `### ${pkg.name}: ${group.title}`,
        "",
        `Source: [\`${group.source}\`](../${pkg.dir}/${group.source.slice(2)})`,
        "",
      );
      for (const entry of group.entries) {
        lines.push(...renderEntry(entry));
      }
    }
  }
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

async function main() {
  const packages = [];
  for (const pkg of PACKAGES) {
    packages.push({ ...pkg, groups: await collectPackage(pkg) });
  }
  const config = (await prettier.resolveConfig(OUTPUT)) ?? {};
  const content = await prettier.format(render(packages), { ...config, parser: "markdown" });
  if (process.argv.includes("--check")) {
    const existing = await readFile(OUTPUT, "utf8").catch(() => "");
    if (existing !== content) {
      console.error("docs/API.md is stale: run `npm run docs:api`.");
      process.exit(1);
    }
    console.log("docs/API.md is up to date.");
    return;
  }
  await writeFile(OUTPUT, content, "utf8");
  console.log(`Wrote ${relative(ROOT, OUTPUT)}.`);
}

await main();
