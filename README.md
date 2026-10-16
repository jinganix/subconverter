# subconverter-ts

[![CI](https://github.com/jinganix/subconverter/actions/workflows/ci.yml/badge.svg)](https://github.com/jinganix/subconverter/actions/workflows/ci.yml)
[![core coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=core)](https://codecov.io/gh/jinganix/subconverter/flags/core)
[![node coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=node)](https://codecov.io/gh/jinganix/subconverter/flags/node)
[![browser coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=browser)](https://codecov.io/gh/jinganix/subconverter/flags/browser)
[![cli coverage](https://codecov.io/gh/jinganix/subconverter/branch/main/graph/badge.svg?flag=cli)](https://codecov.io/gh/jinganix/subconverter/flags/cli)
[![npm core](https://img.shields.io/npm/v/@subconverter/core)](https://www.npmjs.com/package/@subconverter/core)
[![npm node](https://img.shields.io/npm/v/@subconverter/node)](https://www.npmjs.com/package/@subconverter/node)
[![npm browser](https://img.shields.io/npm/v/@subconverter/browser)](https://www.npmjs.com/package/@subconverter/browser)
[![npm cli](https://img.shields.io/npm/v/@subconverter/cli)](https://www.npmjs.com/package/@subconverter/cli)

English | [简体中文](README.zh-CN.md)

A TypeScript rewrite of [tindy2013/subconverter](https://github.com/tindy2013/subconverter):
an isomorphic subscription converter that runs on **Node.js**, in the **browser**, and as a
**CLI**.

It parses the subscription and configuration formats subconverter understands, normalizes
them into a single proxy model, and re-emits them in the format your client needs.

## Layout

This is an npm-workspaces monorepo with a strict dependency direction
(`core` ← `node`/`browser` ← `cli`):

| Package            | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `packages/core`    | Platform-free conversion engine: parsers, generators, node manipulation. |
| `packages/node`    | Node adapter: filesystem + `fetch` subscription loading.                 |
| `packages/browser` | Browser build (ESM + IIFE global `SubConverter`).                        |
| `packages/cli`     | `subconverter` command-line interface.                                   |

The engine never imports Node built-ins or DOM globals, so the same code powers all three
targets.

## Install

```bash
npm i @subconverter/core     # engine only
npm i @subconverter/node     # + Node loader (fetch/fs)
npm i @subconverter/browser  # browser ESM / IIFE global `SubConverter`
npm i -g @subconverter/cli  # CLI: `subconverter`
```

## Capabilities

**Input parsing** (`@subconverter/core`)

- Share links: `ss://`, `ssr://`, `vmess://` (v2rayN / Shadowrocket / Kitsunebi / Quantumult),
  `trojan://`, `hysteria2://` / `hy2://`, `anytls://`, `Netch://`, telegram socks/http.
- Subscriptions: base64 link lists, plain-text link lists, `ssd://`.
- Configs: Clash YAML, Surge/Loon `[Proxy]` INI, v2rayN JSON, Shadowsocks/SSR JSON, SSTap,
  Netch.
- Node manipulation matchers: `!!GROUP=`, `!!GROUPID=`/`!!INSERT=`, `!!TYPE=`, `!!PORT=`,
  `!!SERVER=`, plus rename/emoji/sub-filter rules.

**Output generation**

- Clash / ClashR YAML (`clashNewFieldName` toggles `proxies`/`proxy-groups` vs legacy
  `Proxy`/`Proxy Group`; `dialer-proxy` emission for the new field names).
- Surge (proxy + proxy-group sections, WireGuard sub-sections, base-config preservation).
- Quantumult X (`[server_local]`/`[policy]`), Quantumult (`[SERVER]`/`[POLICY]`), Loon.
- sing-box JSON (`outbounds`, selector/urltest groups, `route.rules`/`route.final` from rulesets).
- Mellow (`[Endpoint]`/`[EndpointGroup]`, `[RoutingRule]` from rulesets).
- Share-link exports: `v2ray`, `ss`, `ssr`, `trojan`, `mixed`, `nodelist`, `ssd`, SIP008.

**Rulesets, groups, and settings**

- Ruleset conversion between Surge / Quantumult X / Clash dialects, emitted as Clash,
  Surge/QuanX/Quan/Surfboard/Loon rules or sing-box `route` fragments.
- Proxy-group compilation with all subconverter matchers and group types (select, url-test,
  fallback, load-balance, relay, ssid, smart).
- External-config parsing (`[custom]` INI: `ruleset`, `custom_proxy_group`, `rename`, `emoji`,
  include/exclude remarks, base files) and request query-string parsing.
- Lightweight template interpolation (`{{ var }}`) driven by `[template]` variables.

## Node adapter

`@subconverter/node` loads subscriptions from URLs, local files, or inline text, and resolves
rulesets from remote URLs or local paths (with `surge:`/`quanx:`/`clash-domain:`-style type
prefixes and automatic dialect detection).

## Development

```bash
npm install
npm run build      # tsup bundles for every package
npm run typecheck  # tsc per package
npm run lint       # eslint (flat config) with --max-warnings 0
npm test           # vitest
npm run format     # prettier
```

## CLI

```bash
# Convert a remote subscription to Clash
subconverter convert --url https://example.com/sub --target clash --out clash.yaml

# Convert a local file, adding emoji and renaming
subconverter convert --file sub.txt --target v2ray \
  --add-emoji --emoji 'HK@🇭🇰' --rename 'Netflix@NF'

# Inspect a single link
subconverter parse 'trojan://pw@1.2.3.4:443?sni=example.com#Node'
```

## Programmatic use

```ts
import { generate, parseSubscription, TargetFormat } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

## Release

All four packages move in lockstep. The root `package.json` version is the source of
truth; `scripts/sync-versions.mjs` fans it out to `packages/*` and `package-lock.json`.

1. Add repo secret `ACTION_TOKEN` (PAT with `repo` + `workflow`). npm auth needs no
   token: this repo uses [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
   (OIDC). On npmjs.com, open each package (`@subconverter/core`, `node`, `browser`,
   `cli`) → Settings → Trusted Publisher → GitHub Actions with org `subconverter`,
   repo `jinganix/subconverter`, workflow file `release.yml`. The `publish-npm` job
   already requests `id-token: write` and upgrades to the latest npm CLI.
2. Actions → `RELEASE` → Run workflow. Leave `version` empty to auto-bump (use `bump`
   to pick `patch`/`minor`/`major`); fill `version` with `x.y.z` to pin a release.
3. The workflow opens `chore: release x.y.z`, auto-merges it, tags `vx.y.z`, creates the
   GitHub release, then publishes in dependency order: `core` → `node`/`browser` → `cli`.
4. Retry a failed target with `publish_only: true` + `targets: <core|node|browser|cli>`
   and the existing `version`.

Bootstrap note: a trust binding can only be created for a package that already exists on
npm, so the very first publish of each package must be done once with a one-off
automation token (`npm publish --access public` from a clean checkout of the release
tag), then bind the trusted publisher and delete the token. Every release after that is
tokenless with automatic provenance.

## License

GPL-3.0, matching the upstream project.
