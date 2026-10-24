# @subconverter/core

Platform-free conversion engine of
[subconverter-ts](https://github.com/jinganix/subconverter): subscription and config
parsing, node manipulation, and re-emission. It has no Node.js built-in imports and no DOM
globals, so the same code runs on Node.js, in the browser, and in a worker.

```bash
npm i @subconverter/core
```

## Quick start

```ts
import { TargetFormat, generate, parseSubscription } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

`parseSubscription` auto-detects the input format. `generate` returns the text for the
requested target and can drop node types that target cannot express.

## Supported input

Share-link lists (plain or base64), `ssd://` subscriptions, Clash YAML, Surge/Loon INI,
and app JSON exports (Shadowsocks `ssconf`, SSR, v2rayN, SSTap, Netch).

Link schemes: `ss://`, `ssr://`, `vmess://`, `vless://`, `trojan://`, `hysteria://`,
`hysteria2://` / `hy2://`, `tuic://`, `anytls://`, `socks://`, `tg://socks`,
`tg://http`, and `Netch://`. WireGuard, Snell, and Hysteria v1 come from config files
only, since they have no share-link scheme.

## Supported output

`clash`, `clashr`, `surge`, `surfboard`, `quanx`, `quan`, `loon`, `mellow`, `singbox`,
`v2ray`, `trojan`, `ss`, `ssr`, `sssub`, `ssd`, `mixed`, and `nodelist` — see the
[`TargetFormat` enum](https://github.com/jinganix/subconverter/blob/main/docs/API.md).

Also included: ruleset conversion between Surge / Quantumult X / Clash dialects,
proxy-group compilation with every subconverter matcher, external `[custom]` INI config
parsing, `/sub` query-string parsing, node rename/emoji/country- prefix rules, and
`subscription-userinfo` quota conversion.

## Defaults

- Rules are **on**: with no `rulesets` and no `groups`, generation falls back to bundled
  upstream-like defaults. Pass `includeRules: false` to strip them.
- `surge` targets version **5** by default (`surgeVersion`).
- `autoCountry` needs a `countryResolver`; `@subconverter/node` supplies a GeoIP-backed
  one.

## API reference

Every public export with its signature, enum members, and interface fields:
[docs/API.md](https://github.com/jinganix/subconverter/blob/main/docs/API.md).

## Related packages

| Package                                                                    | Purpose                                      |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| [`@subconverter/node`](https://npmjs.com/package/@subconverter/node)       | Node adapter: fetch/fs, GeoIP, `/sub` server |
| [`@subconverter/browser`](https://npmjs.com/package/@subconverter/browser) | Browser ESM + IIFE global                    |
| [`@subconverter/cli`](https://npmjs.com/package/@subconverter/cli)         | `subconverter` command                       |

## License

GPL-3.0. The engine is a faithful port of
[tindy2013/subconverter](https://github.com/tindy2013/subconverter).
