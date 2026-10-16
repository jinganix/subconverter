# subconverter-ts

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

## License

GPL-3.0, matching the upstream project.
