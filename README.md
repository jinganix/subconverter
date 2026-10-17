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
| `packages/node`    | Node adapter: filesystem + `fetch` subscription loading, HTTP server.    |
| `packages/browser` | Browser build (ESM + IIFE global `SubConverter`).                        |
| `packages/cli`     | `subconverter` command-line interface.                                   |

The engine never imports Node built-ins or DOM globals, so the same code powers all three
targets.

## Install

```bash
npm i @subconverter/core     # engine only
npm i @subconverter/node     # + Node loader (fetch/fs) and /sub server
npm i @subconverter/browser  # browser ESM / IIFE global `SubConverter`
npm i -g @subconverter/cli  # CLI: `subconverter`
```

## Supported formats

### Input: subscriptions and configs

Everything below is accepted by `parseSubscription` (auto-detected, in order:
structured JSON configs → `ssd://` → Clash YAML → Surge INI → base64/plain link lists).

| Category      | Format                         | Example / detection                                                 | Notes                                                                           |
| ------------- | ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Link list     | Plain-text share links         | one link per line (or space-separated)                              | `parseSubscription` / `parseLink`                                               |
| Link list     | Base64 share-link subscription | standard base64 of the above                                        | auto-decoded; base64 and plain decode to the same nodes                         |
| Link list     | `ssd://` subscription          | `ssd://...`                                                         | SSD servers; `traffic_used`/`traffic_total` use decimal GB (1 GB = 1000³ bytes) |
| Client config | Clash YAML                     | `proxies:` / `Proxy:`                                               | full proxy-type round-trip                                                      |
| Client config | Surge / Loon `[Proxy]` INI     | `[Proxy]`, `[WireGuard]` sections                                   | WireGuard sub-sections preserved                                                |
| App JSON      | Shadowsocks / `ssconf`         | `"version"` + `"servers"`, `"configs"`, `"proxy_apps"`, `ssandroid` | 2-server `ssconf` fixture covered                                               |
| App JSON      | SSR config                     | `"serverSubscribes"`, `"local_address"` + `"local_port"`            |                                                                                 |
| App JSON      | v2rayN JSON                    | `"uiItem"` / `"vnext"`                                              |                                                                                 |
| App JSON      | SSTap JSON                     | `"idInUse"`                                                         |                                                                                 |
| App JSON      | Netch config                   | `"ModeFileNameType"`                                                | plus `Netch://` links                                                           |

### Node protocols and link schemes

`ProxyType` values in `packages/core/src/types/proxy.ts`. Links are parsed by
`explode*` in `packages/core/src/parser/uri.ts`; config-only protocols (no link
scheme) come from Clash/Surge parsers.

| Protocol (`ProxyType`) | Link scheme                                      | Input source                                                          | Transports / TLS notes                                          |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ss` Shadowsocks       | `ss://`                                          | link (SIP002, plain, `simple-obfs`/`v2ray-plugin`)                    | obfs / v2ray-plugin options kept                                |
| `ssr` ShadowsocksR     | `ssr://`                                         | link                                                                  | `origin`/`plain` SSR flattens to SS for SS-only targets         |
| `vmess` VMess          | `vmess://`, `vmess1://`                          | link (v2rayN JSON, Shadowrocket, Kitsunebi, Quantumult share formats) | `tcp`/`ws`; `tls`; `aid`/`aead`                                 |
| `vless` VLESS          | `vless://`                                       | link                                                                  | `tcp`/`ws`/`grpc`; `tls`/`reality` with `flow`/`fp`/`pbk`/`sid` |
| `trojan` Trojan        | `trojan://`                                      | link (direct / `ws`)                                                  | `sni`/`host`/`path`                                             |
| `socks5` SOCKS5        | `socks://`, `tg://socks`, `https://t.me/socks`   | link (incl. Telegram)                                                 | optional auth / TLS                                             |
| `http`/`https` HTTP    | credential URL, `tg://http`, `https://t.me/http` | link (incl. Telegram, `http://` credential lists)                     | `username:password@host:port`                                   |
| `hysteria2` Hysteria2  | `hysteria2://`, `hy2://`                         | link                                                                  | `password`, `sni`, speeds, fingerprint                          |
| `tuic` TUIC            | `tuic://`                                        | link                                                                  | `uuid`/`password`, congestion control                           |
| `anytls` AnyTLS        | `anytls://`                                      | link                                                                  | `password`, `sni`                                               |
| `wireguard` WireGuard  | — (config only)                                  | Clash / Surge `[WireGuard]`                                           | keys, `self-ip`, DNS, MTU, peers                                |
| `snell` Snell          | — (config only)                                  | Clash / Surge                                                         | `psk`, `obfs`, `version`                                        |
| `hysteria` Hysteria v1 | — (config only)                                  | Clash                                                                 | legacy `up`/`down`, obfs, auth                                  |
| `Netch`                | `Netch://`                                       | link                                                                  | Netch share format                                              |

Node manipulation matchers: `!!GROUP=`, `!!GROUPID=`/`!!INSERT=`, `!!TYPE=`,
`!!PORT=`, `!!SERVER=`, plus rename/emoji/sub-filter rules.

### Output: target formats

`generate(nodes, { target, ... })`; `TargetFormat` values in
`packages/core/src/types/settings.ts`. Unsupported nodes are silently dropped
per target (see last column).

| `target`    | File / Content-Type                 | Output shape                                                                                                                                                             | Dropped nodes                                                                                              |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `clash`     | `clash.yaml` / `text/yaml`          | Clash YAML, default `proxies`/`proxy-groups`/`rules`; `legacy=true` restores `Proxy`/`Proxy Group`/`Rule`; `dialer-proxy` for new names; VLESS `flow`/`reality-opts`     | — (all protocols)                                                                                          |
| `clashr`    | `clashr.yaml` / `text/yaml`         | ClashR YAML (same field-name rule as `clash`)                                                                                                                            | — (all protocols)                                                                                          |
| `surge`     | `surge.conf` / `text/plain`         | Surge v2/v3/v4/v5 (`surge_version`, default **5**); proxy + proxy-group sections, WireGuard sub-sections, base-config preservation; Trojan ws params, `hysteria2` naming | VLESS, TUIC, Hysteria v1; VMess/Trojan/WireGuard/Hysteria2/AnyTLS need v4+; SSR needs `surgeSsrPath` + v2+ |
| `surfboard` | `surfboard.conf` / `text/plain`     | Surge-compatible subset, pinned to the latest Surge line format                                                                                                          | everything Surge drops, plus Hysteria2, AnyTLS                                                             |
| `quanx`     | `quanx.conf` / `text/plain`         | Quantumult X `[server_local]`/`[policy]`, incl. `vless` + REALITY keys                                                                                                   | Snell, WireGuard, Hysteria v1, Hysteria2, TUIC, AnyTLS                                                     |
| `quan`      | `quan.conf` / `text/plain`          | Quantumult `[SERVER]`/`[POLICY]`                                                                                                                                         | VLESS, Trojan, Snell, WireGuard, Hysteria*, TUIC, AnyTLS                                                   |
| `loon`      | `loon.conf` / `text/plain`          | Loon `Proxy`/`Proxy Group`, incl. `VLESS` + REALITY keys                                                                                                                 | Snell, Hysteria v1, TUIC, AnyTLS                                                                           |
| `mellow`    | `mellow.conf` / `text/plain`        | Mellow `[Endpoint]`/`[EndpointGroup]`, `[RoutingRule]` from rulesets                                                                                                     | everything except SS (no plugin), VMess, SOCKS5, HTTP                                                      |
| `singbox`   | `singbox.json` / `application/json` | sing-box JSON `outbounds` (selector/urltest groups, `route.rules`/`route.final` from rulesets)                                                                           | SSR (no mapping), Snell                                                                                    |
| `v2ray`     | `v2ray.txt` / `text/plain`          | base64 VMess-link list                                                                                                                                                   | non-VMess                                                                                                  |
| `ss`        | `ss.txt` / `text/plain`             | base64 SS-link list (no duplicates)                                                                                                                                      | non-SS (SSR `origin`/`plain` flattened to SS)                                                              |
| `ssr`       | `ssr.txt` / `text/plain`            | base64 SSR-link list                                                                                                                                                     | non-SSR                                                                                                    |
| `trojan`    | `trojan.txt` / `text/plain`         | base64 Trojan-link list                                                                                                                                                  | non-Trojan                                                                                                 |
| `mixed`     | `mixed.txt` / `text/plain`          | base64 mixed SS/SSR/VMess/Trojan list (classic subset)                                                                                                                   | VLESS, Hysteria2, TUIC, AnyTLS, and others                                                                 |
| `nodelist`  | `nodelist.txt` / `text/plain`       | bare node list, no groups/wrapper                                                                                                                                        | —                                                                                                          |
| `ssd`       | `ssd.txt` / `text/plain`            | `ssd://` document (SS nodes only)                                                                                                                                        | non-SS                                                                                                     |
| `sssub`     | `sssub.json` / `application/json`   | SIP008 JSON (SS nodes only)                                                                                                                                              | non-SS                                                                                                     |
| `auto`      | —                                   | input detection only, not a valid `/sub?target=`                                                                                                                         | —                                                                                                          |

> Supported protocols and node formats grow over time: when a new link scheme,
> transport (`ws`/`grpc`/`h2`/`http`), or TLS mode (e.g. REALITY) is added,
> extend the static matrices in `packages/core/tests/` (`protocol-matrix`,
> `conversion-snapshots`, `format-matrix`) and the tables above together.

**Rulesets, groups, and settings**

- Ruleset conversion between Surge / Quantumult X / Clash dialects, emitted as Clash,
  Surge/QuanX/Quan/Surfboard/Loon rules or sing-box `route` fragments.
- Proxy-group compilation with all subconverter matchers and group types (select, url-test,
  fallback, load-balance, relay, ssid, smart).
- External-config parsing (`[custom]` INI: `ruleset`, `custom_proxy_group`, `rename`, `emoji`,
  include/exclude remarks, base files) and request query-string parsing.
- Lightweight template interpolation (`{{ var }}`) driven by `[template]` variables.
- Rules are **on by default**: with no explicit `rulesets`/`groups`, generation falls back
  to the bundled upstream-like remote defaults (cached with TTL + single-flight in
  `@subconverter/node`, offline fallback to the bundled static rules). Pass
  `no_rules` / `--no-rules` (`includeRules: false`) to strip rules entirely;
  `with_rules` is kept for compatibility. The Surge default version is **5**.

## Node adapter

`@subconverter/node` loads subscriptions from URLs, local files, or inline text, and resolves
rulesets from remote URLs or local paths (with `surge:`/`quanx:`/`clash-domain:`-style type
prefixes and automatic dialect detection). `collectRulesets` fetches concurrently and skips
failures; `getCachedDefaultRulesets` caches the default remote lists.

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

# List all output targets
subconverter formats

# Start an HTTP server like upstream subconverter (default port 25500)
subconverter serve --port 25500 --host 0.0.0.0
```

Convert flags: `--surge-version` (default **5**), `--new-field-name` (default **true**,
`--new-field-name=false` for legacy `Proxy` keys), `--legacy` (legacy Clash field names),
`--with-rules` (default on, kept for compat) / `--no-rules` (strip rules and default groups).

## Server (Docker)

```bash
docker build -t subconverter-ts .
docker run -p 25500:25500 subconverter-ts
# or
docker compose up --build
```

Convert via URL (mirrors upstream `/sub`):

```text
GET http://127.0.0.1:25500/sub?target=clash&url=https://example.com/sub
```

Also `GET /` (usage) and `GET /version`. Only `GET`/`HEAD` are served, with CORS enabled.
Responses set `Content-Type` per target (see table), `Content-Disposition: attachment`,
and forward `subscription-userinfo` / `profile-update-interval` when available.
Limits: `http(s)` URLs only, at most 5 subscription URLs (`|`-separated or repeatable
`url`), 15 s fetch timeout, 5 MB body cap. `config`/`base` accept only remote `http(s)`
URLs (local paths are rejected in server mode); inline `[]RULE` rulesets stay allowed.

### Query parameters

| Param                                                                                                                                                                              | Aliases                                               | Default     | Description                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `target`                                                                                                                                                                           | —                                                     | `clash`     | Output format (see output table; `auto` rejected)                     |
| `url`                                                                                                                                                                              | —                                                     | —           | Subscription URL(s); repeatable, `\|`-separated for multiple          |
| `config`                                                                                                                                                                           | —                                                     | —           | Remote `http(s)` external INI (`[]` ignored; local paths rejected)    |
| `ruleset`                                                                                                                                                                          | `rulesets`                                            | —           | `group,url[,interval]` or `group,[]RULE`; repeatable, `\|`-separated  |
| `group`                                                                                                                                                                            | —                                                     | —           | Extra select-group name (repeatable)                                  |
| `interval`                                                                                                                                                                         | —                                                     | upstream    | Override `profile-update-interval` response header                    |
| `surge_version`                                                                                                                                                                    | `surge-version`, `ver`, `version`                     | `5`         | Surge target version                                                  |
| `new_field_name`                                                                                                                                                                   | `new_name`, hyphen variants                           | `true`      | Clash new field names; bare `?flag` counts as `true`                  |
| `legacy`                                                                                                                                                                           | `legacy_field_name`, `legacy-field-name`              | `false`     | Legacy `Proxy`/`Proxy Group`/`Rule` keys (overrides `new_field_name`) |
| `with_rules`                                                                                                                                                                       | `with-rules`                                          | `true`      | Attach rules + default groups (kept for compat)                       |
| `no_rules`                                                                                                                                                                         | `no-rules`                                            | `false`     | Strip rules and default groups                                        |
| `userinfo_url`                                                                                                                                                                     | `userinfo-url`, `userinfo`                            | —           | Extra quota endpoint (see below)                                      |
| `userinfo_provider`                                                                                                                                                                | `userinfo-provider`, `userinfo_type`, `userinfo-type` | auto-detect | Quota converter (see below)                                           |
| `rename`, `emoji`, `include`, `exclude`, `add_emoji`, `remove_emoji`, `append_type`, `sort`, `filter_deprecated`, `dedupe`, `tfo`, `udp`, `scv`, `tls13`, `insert`, `classical`, … | underscore/hyphen, case-insensitive                   | —           | Every flag parsed by `parseRequestSettings`                           |

### Quota (`userinfo_url`)

Some providers expose usage on a separate endpoint. Pass it with
`userinfo_url` and pick a converter via `userinfo_provider`:

```text
GET /sub?target=clash&url=<sub>&userinfo_url=<quota-url>&userinfo_provider=jms
```

| Provider         | Aliases                                        | Accepts                                                                                                 | Emits                                                                                                                                                 |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | —                                              | JMS JSON → generic JSON → header string                                                                 | `subscription-userinfo` header value                                                                                                                  |
| `jms`            | `justmysocks`, `just-my-socks`                 | Just-My-Socks JSON (`monthly_bw_limit_b`, `bw_counter_b`, `bw_reset_day_of_month`, camelCase tolerated) | `upload=0; download=…; total=…; expire=…`; decimal GB scaled to binary bytes so clients show the advertised quota; `expire` = next UTC-midnight reset |
| `subscription`   | `raw`, `sub`, `clash`, `subscription-userinfo` | `subscription-userinfo`-style value or generic JSON                                                     | normalized and forwarded                                                                                                                              |

Without `userinfo_url`, the server forwards the upstream subscription's
own `subscription-userinfo` header when present; an explicit
`userinfo_url` result takes precedence (without an explicit provider, only known
quota shapes such as JMS are converted). The same converters are
available programmatically via `convertUserinfo`,
`parseJmsUserinfo`, and `formatSubscriptionUserinfo` in
`@subconverter/core`.

## Programmatic use

```ts
import { generate, parseSubscription, TargetFormat } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

```ts
import { convertUserinfo } from "@subconverter/core";
import { convertSubRequest, startServer } from "@subconverter/node";

const userinfo = convertUserinfo(rawQuotaBody, "jms");
const server = await startServer({ host: "0.0.0.0", port: 25500 });
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
