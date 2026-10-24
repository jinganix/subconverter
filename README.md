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

Current release: **v0.2.1** — see [CHANGELOG.md](CHANGELOG.md).

A TypeScript rewrite of [tindy2013/subconverter](https://github.com/tindy2013/subconverter):
an isomorphic subscription converter that runs on **Node.js**, in the **browser**, and as a
**CLI**.

It parses the subscription and configuration formats subconverter understands, normalizes
them into a single proxy model, and re-emits them in the format your client needs.

## Layout

This is an npm-workspaces monorepo with a strict dependency direction
(`core` ← `node`/`browser` ← `cli`):

| Package            | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `packages/core`    | Platform-free conversion engine: parsers, generators, node manipulation.       |
| `packages/node`    | Node adapter: filesystem + `fetch` loading, GeoIP country lookup, HTTP server. |
| `packages/browser` | Browser build (ESM + IIFE global `SubConverter`).                              |
| `packages/cli`     | `subconverter` command-line interface.                                         |

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
`packages/core/src/types/settings.ts`. Each entry lists the output shape, then the node
types the target silently drops.

- `clash` (`clash.yaml`, `text/yaml`) — `proxies`/`proxy-groups`/`rules`; `legacy=true`
  restores `Proxy`/`Proxy Group`/`Rule`; `dialer-proxy` under the new field names; VLESS
  `flow`/`reality-opts`. Drops nothing.
- `clashr` (`clashr.yaml`, `text/yaml`) — ClashR YAML, same field-name rule as `clash`.
  Drops nothing.
- `surge` (`surge.conf`, `text/plain`) — Surge v2–v5 (`surge_version`, default 5); proxy
  and proxy-group sections, WireGuard sub-sections, base-config preservation; Trojan `ws`
  params and `hysteria2` naming. Drops VLESS, TUIC, and Hysteria v1;
  VMess/Trojan/WireGuard/Hysteria2/AnyTLS need v4+; SSR needs `surgeSsrPath` and v2+.
- `surfboard` (`surfboard.conf`, `text/plain`) — latest Surge line format. Drops
  everything Surge drops, plus Hysteria2 and AnyTLS.
- `quanx` (`quanx.conf`, `text/plain`) — `[server_local]`/`[policy]`, including `vless`
  and REALITY keys. Drops Snell, WireGuard, Hysteria v1/v2, TUIC, AnyTLS.
- `quan` (`quan.conf`, `text/plain`) — `[SERVER]`/`[POLICY]`. Drops VLESS, Trojan, Snell,
  WireGuard, Hysteria*, TUIC, AnyTLS.
- `loon` (`loon.conf`, `text/plain`) — `Proxy`/`Proxy Group`, including `VLESS` and
  REALITY keys. Drops Snell, Hysteria v1, TUIC, AnyTLS.
- `mellow` (`mellow.conf`, `text/plain`) — `[Endpoint]`/`[EndpointGroup]`, plus
  `[RoutingRule]` from rulesets. Keeps only SS without plugin, VMess, SOCKS5, and HTTP.
- `singbox` (`singbox.json`, `application/json`) — `outbounds` (selector/urltest groups),
  `route.rules`/`route.final` from rulesets. Drops SSR and Snell.
- `v2ray` (`v2ray.txt`, `text/plain`) — base64 VMess-link list. Drops non-VMess.
- `ss` (`ss.txt`, `text/plain`) — base64 SS-link list, deduplicated; SSR `origin`/`plain`
  flattened to SS. Drops non-SS.
- `ssr` (`ssr.txt`, `text/plain`) — base64 SSR-link list. Drops non-SSR.
- `trojan` (`trojan.txt`, `text/plain`) — base64 Trojan-link list. Drops non-Trojan.
- `mixed` (`mixed.txt`, `text/plain`) — base64 mixed SS/SSR/VMess/Trojan list (classic
  subset). Drops VLESS, Hysteria2, TUIC, AnyTLS.
- `nodelist` (`nodelist.txt`, `text/plain`) — bare node list, no groups or wrapper. Drops
  nothing.
- `ssd` (`ssd.txt`, `text/plain`) — `ssd://` document. Drops non-SS.
- `sssub` (`sssub.json`, `application/json`) — SIP008 JSON. Drops non-SS.
- `auto` — input detection only; not a valid `/sub?target=`.

> Supported protocols and node formats grow over time: when a new link scheme,
> transport (`ws`/`grpc`/`h2`/`http`), or TLS mode (e.g. REALITY) is added,
> extend the static matrices in `packages/core/tests/` (`protocol-matrix`,
> `conversion-snapshots`, `format-matrix`) and the tables above together.

**Rulesets, groups, and settings**

- Ruleset conversion between Surge / Quantumult X / Clash dialects, emitted as Clash,
  Surge/QuanX/Quan/Surfboard/Loon rules or sing-box `route` fragments.
- Proxy-group compilation with all subconverter matchers and group types (select, url-test,
  fallback, load-balance, relay, ssid, smart).
- External-config parsing (`[custom]` INI: `ruleset`, `custom_proxy_group`, `rename`,
  `name_regex`, `name_remove`, `emoji`, include/exclude remarks, base files) and request
  query-string parsing.
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

## Documentation

- [`docs/API.md`](docs/API.md) — every public export with its signature, enum members, and
  interface fields. Generated from the package barrels by `npm run docs:api`;
  `npm run docs:check` (part of `npm run check`) fails when it is stale.
- [`llms.txt`](llms.txt) — compact orientation file for LLM and agent tooling.
- [`CHANGELOG.md`](CHANGELOG.md) — release notes.
- [`AGENTS.md`](AGENTS.md) — coding-agent guide (layering, commands, conventions).

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

### Name cleanup before renaming

`--name-regex <match@replacement>` rewrites node names with a JS regex (`$1` backreferences,
all matches, repeatable) and `--name-remove <a,b>` strips literal fragments (repeatable,
comma-separated). Both run **before** `--rename`, emoji, `--auto-country`, and sorting, so
every later rule sees the cleaned name:

```bash
# abc@server1.xxx.yyy -> server1 -> 美国-server1
subconverter convert --file sub.txt --target clash \
  --name-regex '^abc@([^.]+)\..*$@$1' --auto-country --geoip ./GeoLite2-Country.mmdb

# foo.server1.bar -> server1 (separators left by the removal are collapsed)
subconverter convert --file sub.txt --target clash --name-remove 'foo,bar'
```

An empty result keeps the original name, and malformed regexes are ignored. In external
INI configs the same rules are `name_regex=match@replacement` and `name_remove=a,b`; over
HTTP they are `name_regex` (repeatable) and `name_remove` (comma-separated).

### Country prefix from GeoIP

Names that mention no country/region are prefixed with the server's country, looked up
from a local MaxMind database (GeoLite2/GeoIP2 Country or City `.mmdb`):

```bash
subconverter convert --file sub.txt --target clash \
  --auto-country --geoip ./GeoLite2-Country.mmdb
# server1 -> 美国-server1
```

`--country-locale` picks the `Intl.DisplayNames` locale (default `zh-CN`; `en` yields
`United States-server1`). Names that already carry a region (`香港-01`, `US01`,
`🇭🇰 HK`, `Hong Kong 01`) are left untouched. Domain servers are resolved through DNS
first, once per hostname. Download the database from MaxMind (GeoLite2 requires a free
account) or any compatible mirror; no database is bundled. `data/` is ignored by git, so a
local copy works well there:

```bash
mkdir -p data && curl -fL -o data/GeoLite2-Country.mmdb \
  https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-Country.mmdb
```

## Server (Docker)

```bash
docker build -t subconverter-ts .
docker run -p 25500:25500 subconverter-ts
# or, with the GeoIP database mounted for country-prefixed names
docker compose up --build
```

Convert via URL (mirrors upstream `/sub`):

```text
GET http://127.0.0.1:25500/sub?target=clash&url=https://example.com/sub
```

In server mode, start with `--geoip` to enable country-prefixed names (a mounted
database is enough; `auto_country=false` opts a request out). The database path is
only read from the command line, never from a query parameter:

```bash
subconverter serve --geoip /data/GeoLite2-Country.mmdb
# GET /sub?target=clash&url=...
```

Also `GET /` (usage) and `GET /version`. Only `GET`/`HEAD` are served, with CORS enabled.
Responses set `Content-Type` per target (see the output list above) and
`Content-Disposition: attachment`, and forward `subscription-userinfo` /
`profile-update-interval` when available.
Limits: `http(s)` URLs only, at most 5 subscription URLs (`|`-separated or repeatable
`url`), 15 s fetch timeout, 5 MB body cap. `config`/`base` accept only remote `http(s)`
URLs (local paths are rejected in server mode); inline `[]RULE` rulesets stay allowed.

### Query parameters

Defaults are shown in parentheses; every underscore param also accepts a hyphen alias.

- `target` (`clash`) — output format (see the output list above; `auto` is rejected).
- `url` — subscription URL(s); repeatable, `|`-separated for multiple.
- `config` — remote `http(s)` external INI (`[]` ignored; local paths rejected).
- `ruleset` (alias `rulesets`) — `group,url[,interval]` or `group,[]RULE`; repeatable,
  `|`-separated.
- `group` — extra select-group name (repeatable).
- `interval` (upstream value) — override the `profile-update-interval` response header.
- `surge_version` (aliases `surge-version`, `ver`, `version`; default `5`).
- `new_field_name` (aliases `new_name` and hyphen variants; default `true`) — Clash new
  field names; a bare `?flag` counts as `true`.
- `legacy` (aliases `legacy_field_name`, `legacy-field-name`; default `false`) — legacy
  `Proxy`/`Proxy Group`/`Rule` keys; overrides `new_field_name`.
- `with_rules` (`with-rules`; default `true`) — attach rules and default groups, kept for
  compatibility.
- `no_rules` (`no-rules`; default `false`) — strip rules and default groups.
- `auto_country` (`auto-country`) — prefix names lacking a country; on by default when the
  server runs with `--geoip`.
- `name_regex` — regex replace applied to names before renaming (repeatable).
- `name_remove` — literal fragments removed from names before renaming (comma list).
- `userinfo_url` (aliases `userinfo-url`, `userinfo`) — extra quota endpoint (see below).
- `userinfo_provider` (aliases `userinfo-provider`, `userinfo_type`, `userinfo-type`;
  auto-detected) — quota converter (see below).
- All remaining flags parsed by `parseRequestSettings` (`rename`, `emoji`, `include`,
  `exclude`, `add_emoji`, `remove_emoji`, `append_type`, `sort`, `filter_deprecated`,
  `dedupe`, `tfo`, `udp`, `scv`, `tls13`, `insert`, `classical`, …) accept underscore or
  hyphen and are case-insensitive.

### Quota (`userinfo_url`)

Some providers expose usage on a separate endpoint. Pass it with
`userinfo_url` and pick a converter via `userinfo_provider`:

```text
GET /sub?target=clash&url=<sub>&userinfo_url=<quota-url>&userinfo_provider=jms
```

Provider `auto` (the default) probes JMS JSON, then generic JSON, then a header string, and
always emits a `subscription-userinfo` header value. Each provider:

- `jms` (aliases `justmysocks`, `just-my-socks`) — accepts Just-My-Socks JSON
  (`monthly_bw_limit_b`, `bw_counter_b`, `bw_reset_day_of_month`; camelCase tolerated) and
  emits `upload=0; download=…; total=…; expire=…`, with decimal GB scaled to binary bytes so
  clients show the advertised quota and `expire` set to the next UTC-midnight reset.
- `subscription` (aliases `raw`, `sub`, `clash`, `subscription-userinfo`) — accepts a
  `subscription-userinfo`-style value or generic JSON, then normalizes and forwards it.

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
truth; `scripts/sync-versions.mjs` fans it out to `packages/*`, `package-lock.json`, and the
`Current release` line in both READMEs, so the published pages never disagree with npm.

1. Add repo secret `ACTION_TOKEN` (PAT with `repo` + `workflow`) for the branch push,
   PR, and tag steps. npm auth needs no token: this repo uses
   [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC). On npmjs.com,
   open each package (`@subconverter/core`, `node`, `browser`, `cli`) → Settings →
   Trusted Publisher → GitHub Actions, and set the owner to **`jinganix`** (the GitHub
   owner, not the npm scope `subconverter`), the repository to `subconverter`, and the
   workflow file to `release.yml`.

   Under **Allowed actions**, tick **`npm publish`**. Since 2026-09-03 a new trusted
   publisher only permits `npm stage publish` by default, which is not what this
   workflow uses. The `publish-npm` job requests `id-token: write` and upgrades to the
   latest npm CLI.

   `403 OIDC permission denied for this action` means the binding rejected the publish
   even though the OIDC exchange and provenance signing succeeded. Check, in order: the
   three identifier fields above, then whether **`npm publish`** is ticked under
   Allowed actions. A new binding must complete its first publish within two days or it
   expires and cannot be edited.

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
