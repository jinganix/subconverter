/**
 * Fetch upstream `tindy2013/subconverter` outputs for every mock input and
 * store them under `tests/fixtures/upstream/expected/`.
 *
 * Usage: `node scripts/fetch-upstream.mjs [--base http://127.0.0.1:25500]`
 *
 * Strategy (verified against subconverter v0.9.9):
 * - link lists (`links-all.txt`) are sent directly as `url=<link1>|<link2>...`
 * - file inputs (clash/surge/ssd/base64/ssconf) are sent as
 *   `url=data:text/plain;base64,<base64(content)>` which upstream fetches
 *   and parses as a subscription file.
 * - config targets use `list=true&emoji=false&sort=false&append_type=false
 *   &expand=false&new_name=true` for bare, deterministic node lists that
 *   match `generate()` without groups/rules.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputsDir = join(root, "tests", "fixtures", "upstream", "inputs");
const expectedDir = join(root, "tests", "fixtures", "upstream", "expected");
const base = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://127.0.0.1:25500";

const INPUTS = {
  "links-all": { file: "links-all.txt", mode: "links" },
  clash: { file: "clash.yaml", mode: "data" },
  surge: { file: "surge.ini", mode: "data" },
  ssd: { file: "ssd.txt", mode: "data" },
  "sub-base64": { file: "sub-base64.txt", mode: "data" },
  ssconf: { file: "ssconf.json", mode: "data" },
};

const TARGETS = [
  { name: "clash", query: "target=clash" },
  { name: "clashr", query: "target=clashr" },
  { name: "surge2", query: "target=surge&ver=2" },
  { name: "surge3", query: "target=surge&ver=3" },
  { name: "surge4", query: "target=surge&ver=4" },
  { name: "surfboard", query: "target=surfboard" },
  { name: "quan", query: "target=quan" },
  { name: "quanx", query: "target=quanx" },
  { name: "loon", query: "target=loon" },
  { name: "mellow", query: "target=mellow" },
  { name: "singbox", query: "target=singbox" },
  { name: "ss", query: "target=ss" },
  { name: "sssub", query: "target=sssub" },
  { name: "ssd", query: "target=ssd" },
  { name: "ssr", query: "target=ssr" },
  { name: "v2ray", query: "target=v2ray" },
  { name: "trojan", query: "target=trojan" },
  { name: "mixed", query: "target=mixed" },
];

const LIST_PARAMS = "list=true&emoji=false&sort=false&append_type=false&expand=false&new_name=true";
const LINK_PARAMS = "emoji=false&sort=false&append_type=false&expand=false";
const LIST_TARGETS = new Set([
  "clash",
  "clashr",
  "surge2",
  "surge3",
  "surge4",
  "surfboard",
  "quan",
  "quanx",
  "loon",
  "mellow",
  "singbox",
]);

function buildUrlParam(inputName) {
  const { file, mode } = INPUTS[inputName];
  const content = readFileSync(join(inputsDir, file), "utf8").trim();
  if (mode === "links") {
    const links = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return encodeURIComponent(links.join("|"));
  }
  const b64 = Buffer.from(content, "utf8").toString("base64");
  return encodeURIComponent(`data:text/plain;base64,${b64}`);
}

for (const inputName of Object.keys(INPUTS)) {
  const urlParam = buildUrlParam(inputName);
  for (const target of TARGETS) {
    const extra = LIST_TARGETS.has(target.name) ? LIST_PARAMS : LINK_PARAMS;
    const url = `${base}/sub?${target.query}&url=${urlParam}&${extra}`;
    const res = await fetch(url);
    const text = await res.text();
    const outDir = join(expectedDir, inputName);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${target.name}.txt`), text);
    console.log(`${inputName}/${target.name}: ${text.length} chars ${res.status}`);
  }
}

writeFileSync(
  join(expectedDir, "meta.json"),
  JSON.stringify({ base, inputs: Object.keys(INPUTS), targets: TARGETS.map((t) => t.name) }, null, 2),
);
console.log("done");
