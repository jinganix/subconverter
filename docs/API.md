# API reference

Generated from the public barrels (`packages/*/src/index.ts`) by
`scripts/gen-api-docs.mjs`. Do not edit by hand: run `npm run docs:api`.

Every symbol below is a supported public entry point; anything not listed here
is internal and may change between minor releases.

## Packages

- [`@subconverter/core`](#subconvertercore) — Platform-free conversion engine: parsers, generators, node manipulation, settings, and rulesets.
- [`@subconverter/node`](#subconverternode) — Node.js adapter: `fetch`/`fs` loading, GeoIP country lookup, and the `/sub` HTTP server.
- [`@subconverter/browser`](#subconverterbrowser) — Browser build: ESM plus the IIFE global `SubConverter`.
- [`@subconverter/cli`](#subconvertercli) — Command-line interface.

## @subconverter/core

Platform-free conversion engine: parsers, generators, node manipulation, settings, and rulesets.

Builds from: [`packages/core/src/index.ts`](../packages/core/src/index.ts).

Modules:

- [`types/proxy-group`](#subconvertercore-typesproxy-group): `BalanceStrategy`, `ProxyGroupType`, `createProxyGroupConfig`, `createSelectGroup`, `parseProxyGroupType`, `ProxyGroupConfig`
- [`types/proxy`](#subconvertercore-typesproxy): `DEFAULT_GROUPS`, `ProxyType`, `createProxy`, `proxyTypeName`, `Proxy`
- [`types/ruleset`](#subconvertercore-typesruleset): `RulesetType`, `createRulesetConfig`, `RulesetConfig`, `RulesetContent`
- [`types/settings`](#subconvertercore-typessettings): `TargetFormat`, `createExtraSettings`, `ExtraSettings`, `RegexMatchConfig`, `RequestSettings`
- [`types/tribool`](#subconvertercore-typestribool): `parseTriBool`, `triBoolOr`, `TriBool`
- [`utils/base64`](#subconvertercore-utilsbase64): `base64Decode`, `base64Encode`, `tryBase64Decode`, `urlSafeBase64Decode`, `urlSafeBase64Encode`, `utf8Decode`, `utf8Encode`
- [`utils/ini`](#subconvertercore-utilsini): `findSection`, `getSectionItems`, `parseIni`, `parseRawIni`, `renderRawIni`, `setRawSection`, `IniDocument`, `IniSection`, `RawIniSection`
- [`utils/string`](#subconvertercore-utilsstring): `countOccurrences`, `isBlank`, `isIp`, `isIpv4`, `isIpv6`, `pad2`, `regMatch`, `regReplace`, `replaceAllDistinct`, `split`, `startsWith`, `strFind`, `toBool`, `toInt`, `trim`, `trimLowerCase`
- [`utils/url`](#subconvertercore-utilsurl): `getAllUrlArgs`, `getUrlArg`, `normalizeQueryKey`, `splitUrl`, `stripScheme`, `urlDecode`, `urlEncode`
- [`utils/hash`](#subconvertercore-utilshash): `fnv1a64`, `fnv1a64Hex`
- [`utils/template`](#subconvertercore-utilstemplate): `hasTemplatePlaceholders`, `renderTemplate`, `templateVariableNames`, `TemplateVars`
- [`settings/config`](#subconvertercore-settingsconfig): `parseCustomProxyGroup`, `parseExternalConfig`, `parseGroupTimes`, `parseRegexMatch`, `parseRulesetConfig`, `ExternalConfig`
- [`settings/request-params`](#subconvertercore-settingsrequest-params): `createRequestSettings`, `parseRequestSettings`, `queryBoolFlag`, `resolveNewFieldName`
- [`userinfo`](#subconvertercore-userinfo): `convertUserinfo`, `formatSubscriptionUserinfo`, `inferUserinfoProviderFromUrl`, `nextMonthlyResetTimestamp`, `normalizeUserinfoProvider`, `parseJmsUserinfo`, `parseSubscriptionUserinfo`, `UserinfoData`, `UserinfoProvider`
- [`parser/ciphers`](#subconvertercore-parserciphers): `SS_CIPHERS`, `SSR_CIPHERS`, `isFlattenableSsr`, `isSsCipher`
- [`parser/construct`](#subconvertercore-parserconstruct): `anyTlsConstruct`, `httpConstruct`, `hysteria2Construct`, `hysteriaConstruct`, `snellConstruct`, `socksConstruct`, `ssConstruct`, `ssrConstruct`, `trojanConstruct`, `tuicConstruct`, `vlessConstruct`, `vmessConstruct`, `wireGuardConstruct`
- [`parser/netch`](#subconvertercore-parsernetch): `explodeNetch`
- [`parser/subscription`](#subconvertercore-parsersubscription): `explodeSub`, `explode`, `parseLink`, `parseSubscription`
- [`parser/conf`](#subconvertercore-parserconf): `explodeClash`, `explodeNetchConf`, `explodeSsAndroid`, `explodeSsConf`, `explodeSsrConf`, `explodeSstap`, `explodeSurge`, `explodeVmessConf`, `parseClashText`, `parseConfContent`, `parsePeers`
- [`parser/uri`](#subconvertercore-parseruri): `explodeAnyTls`, `explodeHttp`, `explodeHttpSub`, `explodeHysteria2`, `explodeKitsunebi`, `explodeQuan`, `explodeShadowrocket`, `explodeSocks`, `explodeSs`, `explodeSsd`, `explodeSsr`, `explodeStdVmess`, `explodeTrojan`, `explodeTuic`, `explodeVless`, `explodeVmess`, `isLink`
- [`generator/clash`](#subconvertercore-generatorclash): `buildClash`, `stringifyClash`, `toClash`
- [`generator/default-profile`](#subconvertercore-generatordefault-profile): `getDefaultProxyGroups`, `getDefaultRulesetConfigs`, `getDefaultRulesets`
- [`engine`](#subconvertercore-engine): `generate`, `runPreprocess`, `toSip008`, `GenerateOptions`
- [`generator/ruleset`](#subconvertercore-generatorruleset): `CLASH_RULE_TYPES`, `QUANX_RULE_TYPES`, `SING_BOX_RULE_TYPES`, `SURF_RULE_TYPES`, `SURGE2_RULE_TYPES`, `SURGE_RULE_TYPES`, `convertRuleset`, `rulesetToClashRules`, `rulesetToSingBoxRules`, `rulesetToSurgeRules`, `transformRuleToCommon`, `SingBoxRoute`, `SurgeRulesetResult`
- [`generator/loon`](#subconvertercore-generatorloon): `toLoon`, `LoonOptions`
- [`generator/mellow`](#subconvertercore-generatormellow): `toMellow`, `MellowOptions`
- [`generator/singbox`](#subconvertercore-generatorsingbox): `formatSingBoxInterval`, `toSingBox`, `SingBoxOptions`
- [`generator/quan`](#subconvertercore-generatorquan): `toQuan`, `QuanOptions`
- [`generator/quanx`](#subconvertercore-generatorquanx): `toQuanX`, `QuanxOptions`
- [`generator/surge`](#subconvertercore-generatorsurge): `generatePeer`, `toSurge`
- [`generator/surfboard`](#subconvertercore-generatorsurfboard): `toSurfboard`, `SurfboardOptions`
- [`generator/links`](#subconvertercore-generatorlinks): `proxyToSingle`, `proxyToSsd`, `proxyToSsSub`, `ssLinkConstruct`, `ssrLinkConstruct`, `trojanLinkConstruct`, `vmessLinkConstruct`
- [`generator/nodes`](#subconvertercore-generatornodes): `addEmoji`, `addCountryPrefix`, `applyMatcher`, `checkIgnore`, `dedupeNodes`, `filterNodes`, `groupGenerate`, `matchRange`, `nodeNameRegex`, `nodeNameRemove`, `nodeRename`, `preprocessNodes`, `processRemark`, `removeEmoji`
- [`utils/country`](#subconvertercore-utilscountry): `formatCountryRemark`, `hasRegionName`, `isRegionCode`, `regionDisplayName`, `regionFlag`

### @subconverter/core: types/proxy-group

Source: [`./src/types/proxy-group.ts`](../packages/core/src/types/proxy-group.ts)

#### `BalanceStrategy` (enum)

> Load-balance strategy, mirroring `BalanceStrategy`.

| Member              | Value                  |
| ------------------- | ---------------------- |
| `ConsistentHashing` | `"consistent-hashing"` |
| `RoundRobin`        | `"round-robin"`        |

#### `ProxyGroupType` (enum)

> Proxy group kinds, mirroring subconverter's `ProxyGroupType`.

| Member        | Value            |
| ------------- | ---------------- |
| `Select`      | `"select"`       |
| `URLTest`     | `"url-test"`     |
| `Fallback`    | `"fallback"`     |
| `LoadBalance` | `"load-balance"` |
| `Relay`       | `"relay"`        |
| `SSID`        | `"ssid"`         |
| `Smart`       | `"smart"`        |

#### `createProxyGroupConfig` (function)

> Create a proxy group with subconverter's default field values.

```ts
function createProxyGroupConfig(): ProxyGroupConfig;
```

#### `createSelectGroup` (function)

> Create one select group that fans out to every proxy type, mirroring the
> CLI `--group` flag and the server `group` param. Shared so both
> entrypoints build byte-identical groups.

```ts
function createSelectGroup(name: string): ProxyGroupConfig;
```

#### `parseProxyGroupType` (function)

> Resolve a textual group type (as found in config files).

```ts
function parseProxyGroupType(value: string): ProxyGroupType | undefined;
```

#### `ProxyGroupConfig` (interface)

> A configured proxy group (`[Proxy Group]` entries).

```ts
interface ProxyGroupConfig
```

Members:

- `name` (`string`, required)
- `type` (`ProxyGroupType`, required)
- `proxies` (`string[]`, required)
- `usingProvider` (`string[]`, required)
- `url` (`string`, required)
- `interval` (`number`, required)
- `timeout` (`number`, required)
- `tolerance` (`number`, required)
- `strategy` (`BalanceStrategy`, required)
- `lazy` (`boolean | undefined`, required)
- `disableUdp` (`boolean | undefined`, required)
- `persistent` (`boolean | undefined`, required)
- `evaluateBeforeUse` (`boolean | undefined`, required)

### @subconverter/core: types/proxy

Source: [`./src/types/proxy.ts`](../packages/core/src/types/proxy.ts)

#### `DEFAULT_GROUPS` (const)

> Default provider group names, mirrored from the C++ `*_DEFAULT_GROUP`.

```ts
const DEFAULT_GROUPS = {
  anytls: "AnyTLSProvider",
  http: "HTTPProvider",
  hysteria: "HysteriaProvider",
  hysteria2: "Hysteria2Provider",
  snell: "SnellProvider",
  socks: "SocksProvider",
  ss: "SSProvider",
  ssr: "SSRProvider",
  trojan: "TrojanProvider",
  tuic: "TUICProvider",
  v2ray: "V2RayProvider",
  wireguard: "WireGuardProvider",
} as const;
```

#### `ProxyType` (enum)

> Proxy protocol kinds supported by the converter.

| Member         | Value         |
| -------------- | ------------- |
| `Unknown`      | `"unknown"`   |
| `Shadowsocks`  | `"ss"`        |
| `ShadowsocksR` | `"ssr"`       |
| `VMess`        | `"vmess"`     |
| `VLESS`        | `"vless"`     |
| `Trojan`       | `"trojan"`    |
| `Snell`        | `"snell"`     |
| `HTTP`         | `"http"`      |
| `HTTPS`        | `"https"`     |
| `SOCKS5`       | `"socks5"`    |
| `WireGuard`    | `"wireguard"` |
| `Hysteria`     | `"hysteria"`  |
| `Hysteria2`    | `"hysteria2"` |
| `TUIC`         | `"tuic"`      |
| `AnyTLS`       | `"anytls"`    |

#### `createProxy` (function)

> Create a proxy with subconverter's default field values.

```ts
function createProxy(): Proxy;
```

#### `proxyTypeName` (function)

> Human-readable name used by generators that prefix the remark.

```ts
function proxyTypeName(type: ProxyType): string;
```

#### `Proxy` (interface)

> A single proxy node.
>
> The field set intentionally mirrors subconverter's `Proxy` struct so ports of
> the C++ parsers/generators stay one-to-one and easy to audit.

```ts
interface Proxy
```

Members:

- `type` (`ProxyType`, required)
- `id` (`number`, required)
- `groupId` (`number`, required)
- `group` (`string`, required)
- `remark` (`string`, required)
- `hostname` (`string`, required)
- `port` (`number`, required)
- `username` (`string`, required)
- `password` (`string`, required)
- `encryptMethod` (`string`, required)
- `plugin` (`string`, required)
- `pluginOption` (`string`, required)
- `protocol` (`string`, required)
- `protocolParam` (`string`, required)
- `obfs` (`string`, required)
- `obfsParam` (`string`, required)
- `userId` (`string`, required)
- `alterId` (`number`, required)
- `transferProtocol` (`string`, required)
- `fakeType` (`string`, required)
- `tlsSecure` (`boolean`, required)
- `host` (`string`, required)
- `path` (`string`, required)
- `edge` (`string`, required)
- `flow` (`string`, required) — VLESS `flow` control (e.g. `xtls-rprx-vision`).
- `congestionControl` (`string`, required) — TUIC congestion control algorithm.
- `quicSecure` (`string`, required)
- `quicSecret` (`string`, required)
- `udp` (`TriBool`, required)
- `tcpFastOpen` (`TriBool`, required)
- `allowInsecure` (`TriBool`, required)
- `tls13` (`TriBool`, required)
- `underlyingProxy` (`string`, required)
- `snellVersion` (`number`, required)
- `serverName` (`string`, required)
- `selfIp` (`string`, required)
- `selfIpv6` (`string`, required)
- `publicKey` (`string`, required)
- `privateKey` (`string`, required)
- `preSharedKey` (`string`, required)
- `dnsServers` (`string[]`, required)
- `mtu` (`number`, required)
- `allowedIps` (`string`, required)
- `keepAlive` (`number`, required)
- `testUrl` (`string`, required)
- `clientId` (`string`, required)
- `ports` (`string`, required)
- `up` (`string`, required)
- `upSpeed` (`number`, required)
- `down` (`string`, required)
- `downSpeed` (`number`, required)
- `authStr` (`string`, required)
- `sni` (`string`, required)
- `fingerprint` (`string`, required)
- `shortId` (`string`, required)
- `ca` (`string`, required)
- `caStr` (`string`, required)
- `recvWindowConn` (`number`, required)
- `recvWindow` (`number`, required)
- `disableMtuDiscovery` (`TriBool`, required)
- `hopInterval` (`number`, required)
- `alpn` (`string[]`, required)
- `cwnd` (`number`, required)

### @subconverter/core: types/ruleset

Source: [`./src/types/ruleset.ts`](../packages/core/src/types/ruleset.ts)

#### `RulesetType` (enum)

> Ruleset source dialects, mirroring `ruleset_type` in ruleconvert.h.

| Member           | Value               |
| ---------------- | ------------------- |
| `Surge`          | `"surge"`           |
| `QuantumultX`    | `"quanx"`           |
| `ClashDomain`    | `"clash-domain"`    |
| `ClashIpCidr`    | `"clash-ipcidr"`    |
| `ClashClassical` | `"clash-classical"` |

#### `createRulesetConfig` (function)

> Create a ruleset config with subconverter's defaults.

```ts
function createRulesetConfig(): RulesetConfig;
```

#### `RulesetConfig` (interface)

> One `ruleset=` entry resolved into a group + remote/local source.

```ts
interface RulesetConfig
```

Members:

- `group` (`string`, required)
- `url` (`string`, required)
- `interval` (`number`, required)

#### `RulesetContent` (interface)

> A ruleset with its fetched content and resolved type.

```ts
interface RulesetContent
```

Members:

- `ruleGroup` (`string`, required)
- `rulePath` (`string`, required)
- `rulePathTyped` (`string`, required)
- `ruleType` (`RulesetType`, required)
- `content` (`string`, required)
- `updateInterval` (`number`, required)

### @subconverter/core: types/settings

Source: [`./src/types/settings.ts`](../packages/core/src/types/settings.ts)

#### `TargetFormat` (enum)

> Target output formats.

| Member        | Value         |
| ------------- | ------------- |
| `Clash`       | `"clash"`     |
| `ClashR`      | `"clashr"`    |
| `Surge`       | `"surge"`     |
| `Surfboard`   | `"surfboard"` |
| `QuantumultX` | `"quanx"`     |
| `Quantumult`  | `"quan"`      |
| `Loon`        | `"loon"`      |
| `Mellow`      | `"mellow"`    |
| `V2Ray`       | `"v2ray"`     |
| `Trojan`      | `"trojan"`    |
| `SSD`         | `"ssd"`       |
| `SSC`         | `"ss"`        |
| `SSSub`       | `"sssub"`     |
| `SSR`         | `"ssr"`       |
| `SingBox`     | `"singbox"`   |
| `Mixed`       | `"mixed"`     |
| `NodeList`    | `"nodelist"`  |
| `Auto`        | `"auto"`      |

#### `createExtraSettings` (function)

> Create `ExtraSettings` with subconverter's defaults.

```ts
function createExtraSettings(): ExtraSettings;
```

#### `ExtraSettings` (interface)

> Per-run conversion settings, mirroring `extra_settings`.

```ts
interface ExtraSettings
```

Members:

- `enableRuleGenerator` (`boolean`, required)
- `overwriteOriginalRules` (`boolean`, required)
- `renameArray` (`RegexMatchConfig[]`, required)
- `emojiArray` (`RegexMatchConfig[]`, required)
- `nameRegexArray` (`RegexMatchConfig[]`, required) — Regex rewrites applied to node names before every other naming rule.
- `nameRemove` (`string[]`, required) — Literal fragments stripped from node names before every other naming rule.
- `addEmoji` (`boolean`, required)
- `removeEmoji` (`boolean`, required)
- `autoCountry` (`boolean`, required) — Prefix node names with the server's country/region when the name lacks one.
- `countryLocale` (`string`, required) — Locale used for `Intl.DisplayNames` country names (default `zh-CN`).
- `countryResolver` (`(node: Proxy) => string | undefined`, optional) — Resolve a node's ISO 3166-1 alpha-2 country code. Platform-free: the Node adapter supplies a GeoIP-backed lookup; browsers may supply their own.
- `appendProxyType` (`boolean`, required)
- `nodeList` (`boolean`, required)
- `sortFlag` (`boolean`, required)
- `filterDeprecated` (`boolean`, required)
- `clashNewFieldName` (`boolean`, required)
- `clashScript` (`boolean`, required)
- `clashClassicalRuleset` (`boolean`, required)
- `dedupe` (`boolean`, required)
- `surgeSsrPath` (`string`, required)
- `managedConfigPrefix` (`string`, required)
- `quanxDevId` (`string`, required)
- `udp` (`TriBool`, required)
- `tfo` (`TriBool`, required)
- `skipCertVerify` (`TriBool`, required)
- `tls13` (`TriBool`, required)
- `sortScript` (`string`, required)
- `clashProxiesStyle` (`string`, required)
- `clashProxyGroupsStyle` (`string`, required)
- `authorized` (`boolean`, required)

#### `RegexMatchConfig` (interface)

> A regex/script rewrite rule, mirroring `RegexMatchConfig`.

```ts
interface RegexMatchConfig
```

Members:

- `match` (`string`, required)
- `replace` (`string`, required)
- `script` (`string`, required)

#### `RequestSettings` (interface)

> Structured request/config parameters used by the engine.

```ts
interface RequestSettings
```

Members:

- `target` (`TargetFormat`, required)
- `url` (`string`, required)
- `group` (`ProxyGroupConfig[]`, required)
- `ruleset` (`RulesetConfig[]`, required)
- `rename` (`RegexMatchConfig[]`, required)
- `emoji` (`RegexMatchConfig[]`, required)
- `nameRegex` (`RegexMatchConfig[]`, required) — Regex replacements applied to node names before renaming.
- `nameRemove` (`string[]`, required) — Literal fragments removed from node names before renaming.
- `includeRemarks` (`string[]`, required)
- `excludeRemarks` (`string[]`, required)
- `addEmoji` (`boolean`, required)
- `removeEmoji` (`boolean`, required)
- `autoCountry` (`boolean`, required)
- `appendType` (`boolean`, required)
- `nodeList` (`boolean`, required)
- `dedupe` (`boolean`, required)
- `sort` (`boolean`, required)
- `filterDeprecated` (`boolean`, required)
- `list` (`boolean`, required)
- `tfo` (`TriBool`, required)
- `udp` (`TriBool`, required)
- `scv` (`TriBool`, required)
- `tls13` (`TriBool`, required)
- `newFieldName` (`boolean`, required)
- `classicalRuleset` (`boolean`, required)
- `insert` (`boolean`, required)
- `mixin` (`string`, required)
- `interval` (`number`, required)
- `script` (`string`, required)
- `clashScript` (`boolean`, required)
- `proxiesStyle` (`string`, required)
- `proxyGroupsStyle` (`string`, required)
- `autoExtract` (`boolean`, required)
- `uploadPath` (`string`, required)
- `userinfoUrl` (`string`, required) — Extra quota endpoint fetched server-side (`userinfo_url` / `userinfo-url`).
- `userinfoProvider` (`string`, required) — Converter for the quota endpoint (`jms` for Just-My-Socks, `subscription`, `auto`).

### @subconverter/core: types/tribool

Source: [`./src/types/tribool.ts`](../packages/core/src/types/tribool.ts)

#### `parseTriBool` (function)

> Parse a loose string (e.g. `"1"`, `"true"`, `"0"`) into a `TriBool`.

```ts
function parseTriBool(value: string | undefined | null): TriBool;
```

#### `triBoolOr` (function)

> Treat `undefined` as `false`.

```ts
function triBoolOr(value: TriBool, fallback: boolean): boolean;
```

#### `TriBool` (type)

> A three-valued boolean mirroring subconverter's `tribool`.
>
> `undefined` means "unspecified" and callers decide whether to apply a
> default; `true`/`false` are explicit overrides (e.g. from URL parameters).

```ts
type TriBool = boolean | undefined;
```

### @subconverter/core: utils/base64

Source: [`./src/utils/base64.ts`](../packages/core/src/utils/base64.ts)

#### `base64Decode` (function)

> Standard base64 decode; tolerant of URL-safe input and missing padding.

```ts
function base64Decode(input: string): string;
```

#### `base64Encode` (function)

> Standard base64 encode (with padding).

```ts
function base64Encode(input: string): string;
```

#### `tryBase64Decode` (function)

> Best-effort base64 decode used for subscription bodies: subconverter expects
> a base64 blob but real-world providers sometimes serve plain text.

```ts
function tryBase64Decode(input: string): string;
```

#### `urlSafeBase64Decode` (function)

> URL-safe base64 decode; alias of `base64Decode` (same tolerance).

```ts
function urlSafeBase64Decode(input: string): string;
```

#### `urlSafeBase64Encode` (function)

> URL-safe base64 encode without padding.

```ts
function urlSafeBase64Encode(input: string): string;
```

#### `utf8Decode` (function)

> Decode UTF-8 bytes back to a string.

```ts
function utf8Decode(bytes: Uint8Array): string;
```

#### `utf8Encode` (function)

> UTF-8 encode a string to bytes (browser + Node safe).

```ts
function utf8Encode(input: string): Uint8Array;
```

### @subconverter/core: utils/ini

Source: [`./src/utils/ini.ts`](../packages/core/src/utils/ini.ts)

#### `findSection` (function)

> Return the first section with `name`, if any.

```ts
function findSection(doc: IniDocument, name: string): IniSection | undefined;
```

#### `getSectionItems` (function)

> Return every item of every section named `name`, in document order.

```ts
function getSectionItems(doc: IniDocument, name: string): Array<[string, string]>;
```

#### `parseIni` (function)

> Minimal INI reader mirroring the subset of `ini_reader` subconverter relies
> on: case-preserving keys, duplicate sections, and isolated leading items.

```ts
function parseIni(content: string, options: ParseIniOptions = {}): IniDocument;
```

#### `parseRawIni` (function)

> Split text into ordered raw sections, preserving line content.

```ts
function parseRawIni(content: string): RawIniSection[];
```

#### `renderRawIni` (function)

> Render raw sections back into INI text with blank lines between sections.

```ts
function renderRawIni(sections: RawIniSection[]): string;
```

#### `setRawSection` (function)

> Insert or replace a named raw section, keeping its position when present.

```ts
function setRawSection(sections: RawIniSection[], name: string, lines: string[]): void;
```

#### `IniDocument` (interface)

```ts
interface IniDocument
```

Members:

- `sections` (`IniSection[]`, required)
- `isolated` (`Array<[string, string]>`, required) — Items appearing before the first section header.

#### `IniSection` (interface)

```ts
interface IniSection
```

Members:

- `name` (`string`, required)
- `items` (`Array<[string, string]>`, required)

#### `RawIniSection` (interface)

> A raw INI section: a header name and its untouched lines.

```ts
interface RawIniSection
```

Members:

- `name` (`string`, required)
- `lines` (`string[]`, required)

### @subconverter/core: utils/string

Source: [`./src/utils/string.ts`](../packages/core/src/utils/string.ts)

#### `countOccurrences` (function)

> Count non-overlapping occurrences of `needle` in `haystack`.

```ts
function countOccurrences(haystack: string, needle: string): number;
```

#### `isBlank` (function)

> `true` when the string is empty or only whitespace.

```ts
function isBlank(input: string | undefined | null): boolean;
```

#### `isIp` (function)

> `true` when the host is an IP literal (v4 or v6).

```ts
function isIp(input: string): boolean;
```

#### `isIpv4` (function)

> `true` when the string is a dotted-quad IPv4 literal.

```ts
function isIpv4(input: string): boolean;
```

#### `isIpv6` (function)

> `true` when the string is a bracketed/unbracketed IPv6 literal.

```ts
function isIpv6(input: string): boolean;
```

#### `pad2` (function)

> Pad a value to two digits.

```ts
function pad2(value: number): string;
```

#### `regMatch` (function)

> `true` when `pattern` (a JS regex source) matches anywhere in `input`.

```ts
function regMatch(input: string, pattern: string): boolean;
```

#### `regReplace` (function)

> Replace every regex match, mirroring subconverter's `regReplace`.
> An empty `replacement` removes the matches.

```ts
function regReplace(input: string, pattern: string, replacement = ""): string;
```

#### `replaceAllDistinct` (function)

> Replace distinct consecutive occurrences of `from` with `to`.
> Kept for API parity; equivalent to a global literal replace.

```ts
function replaceAllDistinct(input: string, from: string, to: string): string;
```

#### `split` (function)

> Split a string on a literal delimiter, dropping trailing empties when asked.

```ts
function split(input: string, delimiter: string, removeEmpty = false): string[];
```

#### `startsWith` (function)

> `true` when `input` starts with `prefix`.

```ts
function startsWith(input: string, prefix: string): boolean;
```

#### `strFind` (function)

> `true` when `needle` occurs in `haystack`.

```ts
function strFind(haystack: string, needle: string): boolean;
```

#### `toBool` (function)

> Parse a boolean-ish value ("true"/"false"/"1"/"0").

```ts
function toBool(value: string | undefined | null): boolean;
```

#### `toInt` (function)

> Parse the leading integer of a string; `0` when none is present.

```ts
function toInt(value: string | number | undefined | null): number;
```

#### `trim` (function)

> Trim ASCII whitespace from both ends.

```ts
function trim(input: string): string;
```

#### `trimLowerCase` (function)

> Trim and lowercase.

```ts
function trimLowerCase(input: string): string;
```

### @subconverter/core: utils/url

Source: [`./src/utils/url.ts`](../packages/core/src/utils/url.ts)

#### `getAllUrlArgs` (function)

> Read every occurrence of a parameter from a query string in document
> order (case-insensitive key with `_`/`-` equivalent, each value
> percent-decoded, `+` preserved).
> Shared by `getUrlArg` and server-side repeatable params (`url`, `group`,
> `ruleset`) so both entrypoints decode identically.

```ts
function getAllUrlArgs(query: string, key: string): string[];
```

#### `getUrlArg` (function)

> Read a parameter from a query string, mirroring subconverter's
> `getUrlArg` (last occurrence wins, value percent-decoded).

```ts
function getUrlArg(query: string, key: string): string;
```

#### `normalizeQueryKey` (function)

> Normalize a query key: case-insensitive with `_`/`-` equivalent.

```ts
function normalizeQueryKey(key: string): string;
```

#### `splitUrl` (function)

> Split a URL into its scheme/authority-specific parts without a URL parser.

```ts
function splitUrl(raw: string): { base: string; query: string };
```

#### `stripScheme` (function)

> Strip a scheme prefix (e.g. `ss://`) from a link.

```ts
function stripScheme(link: string): string;
```

#### `urlDecode` (function)

> Percent-decode a URL component, tolerating malformed sequences.

```ts
function urlDecode(input: string): string;
```

#### `urlEncode` (function)

> Percent-encode a URL component (RFC 3986 unreserved kept intact).

```ts
function urlEncode(input: string): string;
```

### @subconverter/core: utils/hash

Source: [`./src/utils/hash.ts`](../packages/core/src/utils/hash.ts)

#### `fnv1a64` (function)

> FNV-1a 64-bit hash, matching subconverter's `hash_` (used for WireGuard
> section names and other deterministic identifiers).

```ts
function fnv1a64(input: string): bigint;
```

#### `fnv1a64Hex` (function)

> Lowercase hex representation of `fnv1a64`.

```ts
function fnv1a64Hex(input: string): string;
```

### @subconverter/core: utils/template

Source: [`./src/utils/template.ts`](../packages/core/src/utils/template.ts)

#### `hasTemplatePlaceholders` (function)

> `true` when the content contains any `{{ ... }}` placeholder.

```ts
function hasTemplatePlaceholders(content: string): boolean;
```

#### `renderTemplate` (function)

> Interpolate `{{ name }}` placeholders in a template body.
>
> This is a pragmatic subset of subconverter's template engine: variables come
> from the `[template]` section of an external config (or the `template` config
> block). Unknown variables resolve to an empty string, matching the engine's
> "undefined variable" behavior.

```ts
function renderTemplate(content: string, vars: TemplateVars): string;
```

#### `templateVariableNames` (function)

> Collect the variable names referenced by a template body.

```ts
function templateVariableNames(content: string): string[];
```

#### `TemplateVars` (type)

> A flat map of template variables (dotted keys are allowed, e.g. `clash.dns.port`).

```ts
type TemplateVars = Record<string, string>;
```

### @subconverter/core: settings/config

Source: [`./src/settings/config.ts`](../packages/core/src/settings/config.ts)

#### `parseCustomProxyGroup` (function)

> Parse a `name`type`rule...` INI proxy-group definition.

```ts
function parseCustomProxyGroup(value: string): ProxyGroupConfig | undefined;
```

#### `parseExternalConfig` (function)

> Parse a subconverter external configuration file.

```ts
function parseExternalConfig(content: string): ExternalConfig;
```

#### `parseGroupTimes` (function)

> Parse `interval[,timeout[,tolerance]]`, mirroring `parseGroupTimes`.

```ts
function parseGroupTimes(src: string): {
  interval: number;
  timeout: number;
  tolerance: number;
};
```

#### `parseRegexMatch` (function)

> Parse a rename/emoji rule using a delimiter (mirrors `from_ini`).

```ts
function parseRegexMatch(value: string, delimiter: string): RegexMatchConfig;
```

#### `parseRulesetConfig` (function)

> Parse a `group,url[,interval]` or `group,[]RULE` INI ruleset definition.

```ts
function parseRulesetConfig(value: string): RulesetConfig | undefined;
```

#### `ExternalConfig` (interface)

> A parsed subconverter external configuration file.

```ts
interface ExternalConfig
```

Members:

- `groups` (`ProxyGroupConfig[]`, required)
- `rulesets` (`RulesetConfig[]`, required)
- `rename` (`RegexMatchConfig[]`, required)
- `emoji` (`RegexMatchConfig[]`, required)
- `nameRegex` (`RegexMatchConfig[]`, required)
- `nameRemove` (`string[]`, required)
- `includeRemarks` (`string[]`, required)
- `excludeRemarks` (`string[]`, required)
- `addEmoji` (`boolean`, required)
- `removeEmoji` (`boolean`, required)
- `autoCountry` (`boolean`, required)
- `enableRuleGenerator` (`boolean`, required)
- `overwriteOriginalRules` (`boolean`, required)
- `baseFiles` (`Record<string, string>`, required)
- `templatePath` (`string`, required)
- `templateVars` (`Record<string, string>`, required)

### @subconverter/core: settings/request-params

Source: [`./src/settings/request-params.ts`](../packages/core/src/settings/request-params.ts)

#### `createRequestSettings` (function)

> Base `RequestSettings` with subconverter's defaults.

```ts
function createRequestSettings(): RequestSettings;
```

#### `parseRequestSettings` (function)

> Parse a request query string into `RequestSettings`.

```ts
function parseRequestSettings(query: string): RequestSettings;
```

#### `queryBoolFlag` (function)

> Read a boolean flag across aliases. Returns `undefined` when no alias is
> present; otherwise `true` when any occurrence is `true`/`1`/bare.
> Shared by server-side flags (`dedupe`, `sort`, `no_rules`, …) so they
> share one presence/OR semantic instead of per-callsite copies.

```ts
function queryBoolFlag(query: string, ...keys: string[]): boolean | undefined;
```

#### `resolveNewFieldName` (function)

> Resolve the Clash field-name style. Defaults to the new `proxies` /
> `proxy-groups` / `rules` keys; `legacy=true` (or an explicit
> `new_name=false` / `new_field_name=false`) opts back into the legacy
> `Proxy` / `Proxy Group` / `Rule` keys.
>
> Exported so the CLI reuses the exact same semantics instead of
> maintaining a divergent copy.

```ts
function resolveNewFieldName(query: string): boolean;
```

### @subconverter/core: userinfo

Source: [`./src/userinfo.ts`](../packages/core/src/userinfo.ts)

#### `convertUserinfo` (function)

> Convert a raw `userinfo_url` response body into a `subscription-userinfo`
> header value using the given provider (`jms` for Just-My-Socks).
> Returns `undefined` when the payload cannot be understood.

```ts
function convertUserinfo(raw: string, provider?: string, nowSec?: number): string | undefined;
```

#### `formatSubscriptionUserinfo` (function)

> Render normalized counters as a `subscription-userinfo` header value.

```ts
function formatSubscriptionUserinfo(data: UserinfoData): string;
```

#### `inferUserinfoProviderFromUrl` (function)

> Guess the quota provider from a `userinfo_url` when the caller did not pass
> one explicitly. Just-My-Socks quota endpoints (`justmysocks*`,
> `jmssub*`, `getbwcounter*`) use the JMS JSON shape; anything else yields
> `undefined` (no suitable provider — the caller must skip conversion
> instead of guessing).

```ts
function inferUserinfoProviderFromUrl(url: string): UserinfoProvider | undefined;
```

#### `nextMonthlyResetTimestamp` (function)

> Compute the next reset timestamp (unix seconds, UTC midnight) for a
> monthly reset day, mirroring how providers reset quotas on a fixed
> day-of-month. Returns `0` when the reset day is invalid.

```ts
function nextMonthlyResetTimestamp(resetDay: number, nowSec?: number): number;
```

#### `normalizeUserinfoProvider` (function)

> Normalize a provider name (`JMS`, `justMySocks`, ...); unknown falls back to `auto`.

```ts
function normalizeUserinfoProvider(provider: string | undefined | null): UserinfoProvider;
```

#### `parseJmsUserinfo` (function)

> Parse a Just-My-Socks JSON payload into normalized counters.

```ts
function parseJmsUserinfo(raw: string, nowSec?: number): UserinfoData | undefined;
```

#### `parseSubscriptionUserinfo` (function)

> Parse a `subscription-userinfo` header value into normalized counters.

```ts
function parseSubscriptionUserinfo(header: string): UserinfoData | undefined;
```

#### `UserinfoData` (interface)

> Normalized traffic counters for a `subscription-userinfo` header.

```ts
interface UserinfoData
```

Members:

- `download` (`number`, required) — Downloaded bytes.
- `expire` (`number`, required) — Expiration as a unix timestamp in seconds (`0` when unknown).
- `total` (`number`, required) — Total monthly bytes (`0` when unknown/unlimited).
- `upload` (`number`, required) — Uploaded bytes.

#### `UserinfoProvider` (type)

> Supported `userinfo_provider` values for `/sub?userinfo_url=...`.

```ts
type UserinfoProvider = "auto" | "jms" | "subscription";
```

### @subconverter/core: parser/ciphers

Source: [`./src/parser/ciphers.ts`](../packages/core/src/parser/ciphers.ts)

#### `SS_CIPHERS` (const)

> Shadowsocks AEAD/stream ciphers recognized by the parser.

```ts
const SS_CIPHERS = [
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
  "2022-blake3-chacha12-poly1305",
  "2022-blake3-chacha8-poly1305",
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-128-gcm",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-192-gcm",
  "aes-256-cfb",
  "aes-256-ctr",
  "aes-256-gcm",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "chacha20",
  "chacha20-ietf",
  "chacha20-ietf-poly1305",
  "rc4-md5",
  "salsa20",
  "xchacha20-ietf-poly1305",
];
```

#### `SSR_CIPHERS` (const)

> ShadowsocksR stream ciphers recognized by the parser.

```ts
const SSR_CIPHERS = [
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-256-cfb",
  "aes-256-ctr",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "cast5-cfb",
  "chacha20",
  "chacha20-ietf",
  "des-cfb",
  "idea-cfb",
  "none",
  "rc2-cfb",
  "rc4",
  "rc4-md5",
  "salsa20",
  "seed-cfb",
  "table",
];
```

#### `isFlattenableSsr` (function)

> True when an SSR node can be flattened to plain Shadowsocks: a known SS
> cipher with no meaningful obfs/protocol. Mirrors subparser.cpp:713.

```ts
function isFlattenableSsr(method: string, obfs: string, protocol: string): boolean;
```

#### `isSsCipher` (function)

> `true` when `cipher` is a Shadowsocks cipher.

```ts
function isSsCipher(cipher: string): boolean;
```

### @subconverter/core: parser/construct

Source: [`./src/parser/construct.ts`](../packages/core/src/parser/construct.ts)

#### `anyTlsConstruct` (function)

> Build an AnyTLS node. Mirrors `anyTLSConstruct`.

```ts
function anyTlsConstruct(node: Proxy, options: AnyTlsOptions): void;
```

#### `httpConstruct` (function)

> Build an HTTP/HTTPS node. Mirrors `httpConstruct`.

```ts
function httpConstruct(node: Proxy, options: HttpOptions): void;
```

#### `hysteria2Construct` (function)

> Build a Hysteria2 node. Mirrors `hysteria2Construct`.

```ts
function hysteria2Construct(node: Proxy, options: Hysteria2Options): void;
```

#### `hysteriaConstruct` (function)

> Build a Hysteria (v1) node. Mirrors `hysteriaConstruct`.

```ts
function hysteriaConstruct(node: Proxy, options: HysteriaOptions): void;
```

#### `snellConstruct` (function)

> Build a Snell node. Mirrors `snellConstruct`.

```ts
function snellConstruct(node: Proxy, options: SnellOptions): void;
```

#### `socksConstruct` (function)

> Build a SOCKS5 node. Mirrors `socksConstruct`.

```ts
function socksConstruct(node: Proxy, options: SocksOptions): void;
```

#### `ssConstruct` (function)

> Build a Shadowsocks node. Mirrors `ssConstruct`.

```ts
function ssConstruct(node: Proxy, options: SsOptions): void;
```

#### `ssrConstruct` (function)

> Build a ShadowsocksR node. Mirrors `ssrConstruct`.

```ts
function ssrConstruct(node: Proxy, options: SsrOptions): void;
```

#### `trojanConstruct` (function)

> Build a Trojan node. Mirrors `trojanConstruct`.

```ts
function trojanConstruct(node: Proxy, options: TrojanOptions): void;
```

#### `tuicConstruct` (function)

> Build a TUIC node.

```ts
function tuicConstruct(node: Proxy, options: TuicOptions): void;
```

#### `vlessConstruct` (function)

> Build a VLESS node.

```ts
function vlessConstruct(node: Proxy, options: VlessOptions): void;
```

#### `vmessConstruct` (function)

> Build a VMess node. Mirrors subparser.cpp `vmessConstruct`.

```ts
function vmessConstruct(node: Proxy, options: VmessOptions): void;
```

#### `wireGuardConstruct` (function)

> Build a WireGuard node. Mirrors `wireguardConstruct`.

```ts
function wireGuardConstruct(node: Proxy, options: WireGuardOptions): void;
```

### @subconverter/core: parser/netch

Source: [`./src/parser/netch.ts`](../packages/core/src/parser/netch.ts)

#### `explodeNetch` (function)

> Parse a `Netch://<base64 json>` link into `node`.

```ts
function explodeNetch(netch: string, node: Proxy): void;
```

### @subconverter/core: parser/subscription

Source: [`./src/parser/subscription.ts`](../packages/core/src/parser/subscription.ts)

#### `explodeSub` (function)

> Parse a subscription body: SSD, Clash YAML, Surge INI, or a newline/space
> delimited base64 list of links. Mirrors `explodeSub`.

```ts
function explodeSub(sub: string, nodes: Proxy[]): void;
```

#### `explode` (function)

> Parse a single proxy link into `node`.

```ts
function explode(link: string, node: Proxy): void;
```

#### `parseLink` (function)

> Parse a link string, returning a node when recognized.

```ts
function parseLink(link: string): Proxy | undefined;
```

#### `parseSubscription` (function)

> Parse a config blob (Clash/SS/SSR/V2Ray/SSTap/Netch) or a subscription.

```ts
function parseSubscription(content: string): Proxy[];
```

### @subconverter/core: parser/conf

Source: [`./src/parser/conf.ts`](../packages/core/src/parser/conf.ts)

#### `explodeClash` (function)

> Parse a Clash `proxies:` list into normalized nodes.

```ts
function explodeClash(root: any, nodes: Proxy[]): void;
```

#### `explodeNetchConf` (function)

> Parse a Netch config JSON.

```ts
function explodeNetchConf(content: string, nodes: Proxy[]): void;
```

#### `explodeSsAndroid` (function)

> Parse a Shadowsocks Android (`com.github.shadowsocks`) node array.

```ts
function explodeSsAndroid(content: string, nodes: Proxy[]): void;
```

#### `explodeSsConf` (function)

> Parse a Shadowsocks Android (`ssconf`) JSON config.

```ts
function explodeSsConf(content: string, nodes: Proxy[]): void;
```

#### `explodeSsrConf` (function)

> Parse a ShadowsocksR config JSON.

```ts
function explodeSsrConf(content: string, nodes: Proxy[]): void;
```

#### `explodeSstap` (function)

> Parse an SSTap config JSON.

```ts
function explodeSstap(content: string, nodes: Proxy[]): void;
```

#### `explodeSurge` (function)

> Parse a Surge/Loon `[Proxy]` configuration into nodes.

```ts
function explodeSurge(surge: string, nodes: Proxy[]): boolean;
```

#### `explodeVmessConf` (function)

> Parse a v2rayN config JSON.

```ts
function explodeVmessConf(content: string, nodes: Proxy[]): void;
```

#### `parseClashText` (function)

> Parse a Clash/plain YAML string into nodes (returns count).

```ts
function parseClashText(content: string, nodes: Proxy[]): boolean;
```

#### `parseConfContent` (function)

> Parse an ss/ssr/v2ray configuration JSON blob (single or list).

```ts
function parseConfContent(content: string, nodes: Proxy[]): boolean;
```

#### `parsePeers` (function)

> Parse a WireGuard `peer = (...)` blob into `node`.

```ts
function parsePeers(node: Proxy, data: string): void;
```

### @subconverter/core: parser/uri

Source: [`./src/parser/uri.ts`](../packages/core/src/parser/uri.ts)

#### `explodeAnyTls` (function)

> Parse an `anytls://` link.

```ts
function explodeAnyTls(link: string, node: Proxy): void;
```

#### `explodeHttp` (function)

> Parse a telegram-style HTTP proxy link.

```ts
function explodeHttp(link: string, node: Proxy): void;
```

#### `explodeHttpSub` (function)

> Parse an HTTP(S) link with base64-encoded credentials.

```ts
function explodeHttpSub(link: string, node: Proxy): void;
```

#### `explodeHysteria2` (function)

> Parse a `hysteria2://` / `hy2://` link.

```ts
function explodeHysteria2(link: string, node: Proxy): void;
```

#### `explodeKitsunebi` (function)

> Parse a Kitsunebi-style `vmess1://` link.

```ts
function explodeKitsunebi(kit: string, node: Proxy): void;
```

#### `explodeQuan` (function)

> Parse a Quantumult `remarks = vmess, ...` definition.

```ts
function explodeQuan(quan: string, node: Proxy): void;
```

#### `explodeShadowrocket` (function)

> Parse a Shadowrocket-style VMess link.

```ts
function explodeShadowrocket(rocket: string, node: Proxy): void;
```

#### `explodeSocks` (function)

> Parse `socks://`, `tg://socks`, or `https://t.me/socks` links.

```ts
function explodeSocks(link: string, node: Proxy): void;
```

#### `explodeSs` (function)

> Parse a `ss://` link into `node`.

```ts
function explodeSs(ss: string, node: Proxy): void;
```

#### `explodeSsd` (function)

> Parse an `ssd://` (ShadowsocksD) subscription.

```ts
function explodeSsd(link: string, nodes: Proxy[]): void;
```

#### `explodeSsr` (function)

> Parse a `ssr://` link into `node`.

```ts
function explodeSsr(ssr: string, node: Proxy): void;
```

#### `explodeStdVmess` (function)

> Parse the `net:uuid-aid@host:port` VMess variant.

```ts
function explodeStdVmess(vmess: string, node: Proxy): void;
```

#### `explodeTrojan` (function)

> Parse a `trojan://` link.

```ts
function explodeTrojan(trojan: string, node: Proxy): void;
```

#### `explodeTuic` (function)

> Parse a `tuic://` link.

```ts
function explodeTuic(link: string, node: Proxy): void;
```

#### `explodeVless` (function)

> Parse a `vless://` link.

```ts
function explodeVless(link: string, node: Proxy): void;
```

#### `explodeVmess` (function)

> Parse `vmess://<base64 json>` or a variant link into `node`.

```ts
function explodeVmess(vmess: string, node: Proxy): void;
```

#### `isLink` (function)

> `true` when the link is a plain HTTP(S) subscription URL.

```ts
function isLink(link: string): boolean;
```

### @subconverter/core: generator/clash

Source: [`./src/generator/clash.ts`](../packages/core/src/generator/clash.ts)

#### `buildClash` (function)

> Build the Clash document object (without serialization).

```ts
function buildClash(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  clashR = false,
): ClashBuildResult;
```

#### `stringifyClash` (function)

> Serialize a Clash document built by `buildClash`.

```ts
function stringifyClash(doc: Record<string, unknown>): string;
```

#### `toClash` (function)

> Convert nodes into a Clash YAML configuration string.

```ts
function toClash(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  clashR = false,
): string;
```

### @subconverter/core: generator/default-profile

Source: [`./src/generator/default-profile.ts`](../packages/core/src/generator/default-profile.ts)

#### `getDefaultProxyGroups` (function)

> Bundled default proxy groups, mirroring upstream `ACL4SSR.ini`
> (`tindy2013/subconverter/base/config/ACL4SSR.ini`).
>
> Used only when `generate(..., { includeRules: true })` is set and the caller
> did not provide explicit groups. Kept offline so the core engine stays
> platform-free (no fetch required).

```ts
function getDefaultProxyGroups(): ProxyGroupConfig[];
```

#### `getDefaultRulesetConfigs` (function)

> Remote ruleset configs matching upstream `ACL4SSR.ini` for callers that can
> fetch (Node adapter / CLI `--config`). Paths follow the public ACL4SSR
> mirror; `collectRulesets` in `@subconverter/node` resolves them.

```ts
function getDefaultRulesetConfigs(): RulesetConfig[];
```

#### `getDefaultRulesets` (function)

> Bundled offline default rules, mirroring the structure of upstream
> `ACL4SSR.ini` + its `rules/ACL4SSR` lists (LAN/China direct, ad reject,
> messenger/media proxy, final catch-all).
>
> These are intentionally compact (≈60 rules) so `includeRules: true` works
> without network access. Callers needing the full upstream lists should pass
> explicit `RulesetContent` (or `getDefaultRulesetConfigs` via the
> Node adapter, which fetches the remote lists).

```ts
function getDefaultRulesets(): RulesetContent[];
```

### @subconverter/core: engine

Source: [`./src/engine.ts`](../packages/core/src/engine.ts)

#### `generate` (function)

> Convert nodes into the requested output format.
>
> This is the isomorphic generation entry point used by the CLI, the Node
> adapter, and the browser build.

```ts
function generate(nodes: Proxy[], options: GenerateOptions): string;
```

#### `runPreprocess` (function)

> Apply rename/emoji/sort preprocessing from settings to nodes.

```ts
function runPreprocess(nodes: Proxy[], settings: ExtraSettings): void;
```

#### `toSip008` (function)

> Export Shadowsocks nodes as a SIP008 document (`ssconf`).

```ts
function toSip008(nodes: Proxy[], baseConf = ""): string;
```

#### `GenerateOptions` (interface)

> Options controlling a single conversion.

```ts
interface GenerateOptions
```

Members:

- `target` (`TargetFormat`, required)
- `groups` (`ProxyGroupConfig[]`, optional)
- `settings` (`Partial<ExtraSettings>`, optional)
- `baseConf` (`string`, optional)
- `surgeVersion` (`number`, optional)
- `rulesets` (`RulesetContent[]`, optional)
- `includeRules` (`boolean`, optional) — Whether to attach rules (and default proxy groups) like upstream `tindy2013/subconverter` does with e.g. `config=ACL4SSR.ini`. - `true`/`undefined` (default): emit rules; when `rulesets` is empty, fall back to the bundled offline defaults. When `groups` is empty, fall back to the bundled default proxy groups so rule references resolve. Pass `no_rules`/`--no-rules` (`false`) to strip rules. - `false`: never emit rules, even if `rulesets` are provided.

### @subconverter/core: generator/ruleset

Source: [`./src/generator/ruleset.ts`](../packages/core/src/generator/ruleset.ts)

#### `CLASH_RULE_TYPES` (const)

```ts
const CLASH_RULE_TYPES = [...BASIC_TYPES, "IP-CIDR6", "SRC-PORT", "DST-PORT", "PROCESS-NAME"];
```

#### `QUANX_RULE_TYPES` (const)

```ts
const QUANX_RULE_TYPES = [...BASIC_TYPES, "USER-AGENT", "HOST", "HOST-SUFFIX", "HOST-KEYWORD"];
```

#### `SING_BOX_RULE_TYPES` (const)

```ts
const SING_BOX_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-VERSION",
  "INBOUND",
  "PROTOCOL",
  "NETWORK",
  "GEOSITE",
  "SRC-GEOIP",
  "DOMAIN-REGEX",
  "PROCESS-NAME",
  "PROCESS-PATH",
  "PACKAGE-NAME",
  "PORT",
  "PORT-RANGE",
  "SRC-PORT",
  "SRC-PORT-RANGE",
  "USER",
  "USER-ID",
];
```

#### `SURF_RULE_TYPES` (const)

```ts
const SURF_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];
```

#### `SURGE2_RULE_TYPES` (const)

```ts
const SURGE2_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "USER-AGENT",
  "URL-REGEX",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];
```

#### `SURGE_RULE_TYPES` (const)

```ts
const SURGE_RULE_TYPES = [
  ...BASIC_TYPES,
  "IP-CIDR6",
  "USER-AGENT",
  "URL-REGEX",
  "AND",
  "OR",
  "NOT",
  "PROCESS-NAME",
  "IN-PORT",
  "DEST-PORT",
  "SRC-IP",
];
```

#### `convertRuleset` (function)

> Convert a ruleset body into the common `TYPE,VALUE[,flag]` Surge dialect.
> Mirrors ruleconvert.cpp `convertRuleset`.

```ts
function convertRuleset(content: string, type: RulesetType): string;
```

#### `rulesetToClashRules` (function)

> Convert rulesets into an ordered list of Clash rule strings.

```ts
function rulesetToClashRules(rulesets: RulesetContent[]): string[];
```

#### `rulesetToSingBoxRules` (function)

> Convert rulesets into a sing-box `route` fragment.
> Mirrors ruleconvert.cpp `rulesetToSingBox`.

```ts
function rulesetToSingBoxRules(rulesets: RulesetContent[]): SingBoxRoute;
```

#### `rulesetToSurgeRules` (function)

> Convert rulesets into Surge/QuanX/Quan/Loon rule lines.

```ts
function rulesetToSurgeRules(rulesets: RulesetContent[], surgeVersion: number): SurgeRulesetResult;
```

#### `transformRuleToCommon` (function)

> Rewrite `TYPE,VALUE[,flag]` into `TYPE,VALUE,GROUP[,flag]`.

```ts
function transformRuleToCommon(input: string, group: string, noResolveOnly = false): string;
```

#### `SingBoxRoute` (interface)

> A sing-box `route` fragment produced from rulesets.

```ts
interface SingBoxRoute
```

Members:

- `rules` (`Record<string, unknown>[]`, required)
- `final` (`string`, required)

#### `SurgeRulesetResult` (interface)

```ts
interface SurgeRulesetResult
```

Members:

- `section` (`string`, required)
- `lines` (`string[]`, required)

### @subconverter/core: generator/loon

Source: [`./src/generator/loon.ts`](../packages/core/src/generator/loon.ts)

#### `toLoon` (function)

> Convert nodes into a Loon configuration string.

```ts
function toLoon(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: LoonOptions,
): string;
```

#### `LoonOptions` (interface)

```ts
interface LoonOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rules` (`{ section: string; lines: string[] }`, optional) — Rule lines to inject, plus the section name to place them in.

### @subconverter/core: generator/mellow

Source: [`./src/generator/mellow.ts`](../packages/core/src/generator/mellow.ts)

#### `toMellow` (function)

> Convert nodes into a Mellow (`mellow.conf`) configuration string.

```ts
function toMellow(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: MellowOptions,
): string;
```

#### `MellowOptions` (interface)

```ts
interface MellowOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rulesets` (`RulesetContent[]`, optional)
- `overwriteOriginalRules` (`boolean`, optional)

### @subconverter/core: generator/singbox

Source: [`./src/generator/singbox.ts`](../packages/core/src/generator/singbox.ts)

#### `formatSingBoxInterval` (function)

> Format a sing-box duration string from seconds (e.g. 3660 → `1h1m`).

```ts
function formatSingBoxInterval(interval: number): string;
```

#### `toSingBox` (function)

> Convert nodes into a sing-box configuration JSON string.

```ts
function toSingBox(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SingBoxOptions,
): string;
```

#### `SingBoxOptions` (interface)

```ts
interface SingBoxOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rulesets` (`RulesetContent[]`, optional)
- `overwriteOriginalRules` (`boolean`, optional)

### @subconverter/core: generator/quan

Source: [`./src/generator/quan.ts`](../packages/core/src/generator/quan.ts)

#### `toQuan` (function)

> Convert nodes into a Quantumult configuration string.

```ts
function toQuan(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: QuanOptions,
): string;
```

#### `QuanOptions` (interface)

```ts
interface QuanOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rules` (`{ section: string; lines: string[] }`, optional) — Rule lines to inject, plus the section name to place them in.

### @subconverter/core: generator/quanx

Source: [`./src/generator/quanx.ts`](../packages/core/src/generator/quanx.ts)

#### `toQuanX` (function)

> Convert nodes into a Quantumult X configuration string.

```ts
function toQuanX(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: QuanxOptions,
): string;
```

#### `QuanxOptions` (interface)

```ts
interface QuanxOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rules` (`{ section: string; lines: string[] }`, optional) — Rule lines to inject, plus the section name to place them in.

### @subconverter/core: generator/surge

Source: [`./src/generator/surge.ts`](../packages/core/src/generator/surge.ts)

#### `generatePeer` (function)

> Build a WireGuard `peer=(...)` clause.

```ts
function generatePeer(node: Proxy, clientIdAsReserved = false): string;
```

#### `toSurge` (function)

> Convert nodes into a Surge configuration string.

```ts
function toSurge(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SurgeOptions,
): string;
```

### @subconverter/core: generator/surfboard

Source: [`./src/generator/surfboard.ts`](../packages/core/src/generator/surfboard.ts)

#### `toSurfboard` (function)

> Convert nodes into a Surfboard configuration.
>
> Surfboard is Surge-compatible but drops Hysteria2/AnyTLS nodes while keeping the same
> latest-Surge proxy-line format for the rest (SS/SSR-less VMess/Trojan/
> SOCKS/HTTP subset). Reuse the Surge generator on the filtered node list
> so proxy-line fixes stay in one place.

```ts
function toSurfboard(
  nodes: Proxy[],
  extraProxyGroup: ProxyGroupConfig[],
  settings: ExtraSettings,
  options: SurfboardOptions,
): string;
```

#### `SurfboardOptions` (interface)

```ts
interface SurfboardOptions
```

Members:

- `baseConf` (`string`, required)
- `nodeList` (`boolean`, required)
- `rules` (`{ section: string; lines: string[] }`, optional)

### @subconverter/core: generator/links

Source: [`./src/generator/links.ts`](../packages/core/src/generator/links.ts)

#### `proxyToSingle` (function)

> Export nodes as a plaintext or base64 list of share links.
> `types` bitmask: SS=1, SSR=2, VMess=4, Trojan=8.

```ts
function proxyToSingle(nodes: Proxy[], types: number, settings: ExtraSettings): string;
```

#### `proxyToSsd` (function)

> Export Shadowsocks nodes as an `ssd://` document.

```ts
function proxyToSsd(nodes: Proxy[], group: string, userinfo: string): string;
```

#### `proxyToSsSub` (function)

> Export Shadowsocks nodes as a SIP008 (`ssconf`) document.

```ts
function proxyToSsSub(nodes: Proxy[], baseConf: string): string;
```

#### `ssLinkConstruct` (function)

> Build an `ss://` link.

```ts
function ssLinkConstruct(proxy: Proxy): string;
```

#### `ssrLinkConstruct` (function)

> Build an `ssr://` link.

```ts
function ssrLinkConstruct(
  hostname: string,
  port: number,
  protocol: string,
  method: string,
  obfs: string,
  password: string,
  group: string,
  remark: string,
  obfsParam = "",
  protocolParam = "",
): string;
```

#### `trojanLinkConstruct` (function)

> Build a `trojan://` link.

```ts
function trojanLinkConstruct(proxy: Proxy): string;
```

#### `vmessLinkConstruct` (function)

> Build the JSON payload of a `vmess://` link.

```ts
function vmessLinkConstruct(
  remarks: string,
  add: string,
  port: string,
  type: string,
  id: string,
  aid: string,
  net: string,
  path: string,
  host: string,
  tls: string,
): string;
```

### @subconverter/core: generator/nodes

Source: [`./src/generator/nodes.ts`](../packages/core/src/generator/nodes.ts)

#### `addEmoji` (function)

> Prefix an emoji chosen by the emoji rules.

```ts
function addEmoji(node: Proxy, emojiArray: RegexMatchConfig[]): string;
```

#### `addCountryPrefix` (function)

> Prefix a node's remark with its server country/region when the remark does
> not already mention one (e.g. `server1` -> `美国-server1`).
>
> `resolve` returns an ISO 3166-1 alpha-2 code; a missing/unknown code leaves
> the remark untouched. Mirrors the request `auto_country` switch.

```ts
function addCountryPrefix(
  node: Proxy,
  resolve: (node: Proxy) => string | undefined,
  locale = "zh-CN",
): string;
```

#### `applyMatcher` (function)

> Resolve a matcher rule against a node.
>
> Returns whether the rule's primary predicate matched; `realRule` receives the
> remaining remark regex (empty means "match all").

```ts
function applyMatcher(rule: string, node: Proxy): { matched: boolean; realRule: string };
```

#### `checkIgnore` (function)

> `true` when a node should be filtered out by the include/exclude remarks.

```ts
function checkIgnore(node: Proxy, excludeRemarks: string[], includeRemarks: string[]): boolean;
```

#### `dedupeNodes` (function)

> Remove nodes that share a type, server, port, and remark. Returns the count removed.

```ts
function dedupeNodes(nodes: Proxy[]): number;
```

#### `filterNodes` (function)

> Remove excluded nodes and renumber the remaining ones in place.

```ts
function filterNodes(
  nodes: Proxy[],
  excludeRemarks: string[],
  includeRemarks: string[],
  groupId: number,
): void;
```

#### `groupGenerate` (function)

> Expand a proxy-group `proxies` rule into concrete node remarks.

```ts
function groupGenerate(
  rule: string,
  nodeList: Proxy[],
  filteredNodeList: string[],
  addDirect: boolean,
): void;
```

#### `matchRange` (function)

> Does `target` fall within a subconverter range expression like `1-5,8,!3`?

```ts
function matchRange(range: string, target: number): boolean;
```

#### `nodeNameRegex` (function)

> Replace every match of the user-supplied regex rules in a node's remark.

```ts
function nodeNameRegex(node: Proxy, rules: RegexMatchConfig[]): void;
```

#### `nodeNameRemove` (function)

> Remove literal fragments from a node's remark (e.g. `foo.server1.bar` with
> `["foo", "bar"]` -> `server1`). Separators left at the edges or doubled by
> the removal are collapsed.

```ts
function nodeNameRemove(node: Proxy, removeList: string[]): void;
```

#### `nodeRename` (function)

> Apply rename rules to a node's remark (script rules are ignored).

```ts
function nodeRename(node: Proxy, renameArray: RegexMatchConfig[]): void;
```

#### `preprocessNodes` (function)

> Apply name cleanup, emoji removal, renaming, emoji insertion, and optional sorting.

```ts
function preprocessNodes(nodes: Proxy[], options: PreprocessOptions): void;
```

#### `processRemark` (function)

> Normalize a remark for output: `=`→`-`, optional CSV quoting, de-duplication.

```ts
function processRemark(remark: string, remarksList: string[], procComma = true): string;
```

#### `removeEmoji` (function)

> Strip leading astral emoji from a remark (mirrors subconverter's byte check).

```ts
function removeEmoji(originalRemark: string): string;
```

### @subconverter/core: utils/country

Source: [`./src/utils/country.ts`](../packages/core/src/utils/country.ts)

#### `formatCountryRemark` (function)

> Prepend `name-` to a node remark (e.g. `server1` -> `美国-server1`).
> An empty remark becomes just the country name.

```ts
function formatCountryRemark(remark: string, code: string, locale = "zh-CN"): string;
```

#### `hasRegionName` (function)

> `true` when a node name already mentions a country/region — a localized
> name, a common English spelling, a flag emoji, or an ISO code token such as
> `US` in `US-01` / `US01`.

```ts
function hasRegionName(remark: string): boolean;
```

#### `isRegionCode` (function)

> `true` when the code is a known ISO 3166-1 alpha-2 region.

```ts
function isRegionCode(code: string): boolean;
```

#### `regionDisplayName` (function)

> Localized country/region name (e.g. `美国`), falling back to the code.

```ts
function regionDisplayName(code: string, locale = "zh-CN"): string;
```

#### `regionFlag` (function)

> Flag emoji for a region code, or `""` when the code is invalid.

```ts
function regionFlag(code: string): string;
```

## @subconverter/node

Node.js adapter: `fetch`/`fs` loading, GeoIP country lookup, and the `/sub` HTTP server.

Builds from: [`packages/node/src/index.ts`](../packages/node/src/index.ts).

Modules:

- [`(entry point)`](#subconverternode-entry-point): `LoadOptions`, `MAX_FETCH_BYTES`, `readCappedText`, `fetchSubscription`, `readSubscriptionFile`, `writeOutputFile`, `SubscriptionSource`, `resolveSubscription`, `loadNodes`, `ConvertRequest`, `ConvertInput`, `detectRulesetType`, `parseRulesetSource`, `loadRuleset`, `collectRulesets`, `clearDefaultRulesetCache`, `getCachedDefaultRulesets`, `collectNodes`, `prepareConversion`, `buildCountryResolver`, `defaultRequestSettings`
- [`geoip`](#subconverternode-geoip): `clearGeoIpCache`, `countryResolverFrom`, `getGeoIpDatabase`, `isHostIp`, `openGeoIpDatabase`, `resolveNodeCountries`, `GeoIpDatabase`, `ResolveCountryOptions`
- [`server`](#subconverternode-server): `collectRequestUrls`, `contentTypeForTarget`, `convertSubRequest`, `createSubServer`, `fetchSubscriptionDetailed`, `fetchUserinfoHeader`, `splitSubscriptionUrls`, `startServer`, `ServeOptions`, `SubConversion`

### @subconverter/node: (entry point)

Source: [`./src/index.ts`](../packages/node/src/index.ts)

#### `LoadOptions` (interface)

> Options for `loadSubscription`.

```ts
interface LoadOptions
```

Members:

- `headers` (`Record<string, string>`, optional) — Optional request headers (e.g. `User-Agent`, `Authorization`).
- `proxy` (`string`, optional) — Optional proxy to route the request through (not yet supported).
- `timeoutMs` (`number`, optional) — Abort the request after this many milliseconds.
- `maxBytes` (`number`, optional) — Abort when the response body exceeds this many bytes.

#### `MAX_FETCH_BYTES` (const)

> Default cap for a single fetched body (mirrors the server limit).

```ts
const MAX_FETCH_BYTES = 5 * 1024 * 1024;
```

#### `readCappedText` (function)

> Read a `Response` body as text while enforcing `maxBytes`.
> Shared by `fetchSubscription` and the HTTP server so both entrypoints
> enforce the same cap with the same semantics.

```ts
async function readCappedText(response: Response, maxBytes: number): Promise<string>;
```

#### `fetchSubscription` (function)

> Fetch a remote subscription body as text.

```ts
async function fetchSubscription(url: string, options: LoadOptions = {}): Promise<string>;
```

#### `readSubscriptionFile` (function)

> Read a local subscription/config file as text.

```ts
async function readSubscriptionFile(path: string): Promise<string>;
```

#### `writeOutputFile` (function)

> Write generated output to a local file.

```ts
async function writeOutputFile(path: string, content: string): Promise<void>;
```

#### `SubscriptionSource` (type)

> A subscription source: a URL, a local path, or an inline body.

```ts
type SubscriptionSource =
  | { kind: "url"; url: string; headers?: Record<string, string> }
  | { kind: "file"; path: string }
  | { kind: "text"; text: string };
```

#### `resolveSubscription` (function)

> Resolve any `SubscriptionSource` to raw text.

```ts
async function resolveSubscription(source: SubscriptionSource): Promise<string>;
```

#### `loadNodes` (function)

> Load and parse a subscription source into proxy nodes.

```ts
async function loadNodes(source: SubscriptionSource): Promise<Proxy[]>;
```

#### `ConvertRequest` (interface)

> A fully-resolved conversion request.

```ts
interface ConvertRequest
```

Members:

- `sources` (`SubscriptionSource[]`, required)
- `target` (`TargetFormat`, required)
- `extraProxyGroup` (`ProxyGroupConfig[]`, optional)
- `rulesets` (`RulesetConfig[]`, optional)
- `settings` (`Partial<ExtraSettings>`, optional)
- `geoipPath` (`string`, optional) — Local MaxMind `.mmdb` database (GeoLite2/GeoIP2 Country or City) used to prefix node names with their country when `settings.autoCountry` is on.
- `includeRules` (`boolean`, optional) — When `false`, rules are stripped. Defaults to `true`: with no explicit `rulesets`/`extraProxyGroup`, fall back to the bundled upstream-like defaults (`ACL4SSR`). Maps to core `GenerateOptions.includeRules`.

#### `ConvertInput` (interface)

> Resolved inputs for the core generation layer.

```ts
interface ConvertInput
```

Members:

- `nodes` (`Proxy[]`, required)
- `target` (`TargetFormat`, required)
- `extraProxyGroup` (`ProxyGroupConfig[]`, required)
- `rulesets` (`RulesetContent[]`, required)
- `settings` (`ExtraSettings`, required)
- `includeRules` (`boolean`, optional)

#### `detectRulesetType` (function)

> Infer a ruleset dialect from content when no explicit hint is given.

```ts
function detectRulesetType(content: string): RulesetType;
```

#### `parseRulesetSource` (function)

> Resolve a ruleset source string into a URL/path plus its dialect.

```ts
function parseRulesetSource(source: string): { url: string; type?: RulesetType };
```

#### `loadRuleset` (function)

> Fetch or read a ruleset body and normalize it into a `RulesetContent`.

```ts
async function loadRuleset(
  config: RulesetConfig,
  options: LoadOptions = {},
): Promise<RulesetContent>;
```

#### `collectRulesets` (function)

> Fetch/read every configured ruleset concurrently, skipping failures.

```ts
async function collectRulesets(
  configs: RulesetConfig[],
  options: LoadOptions = {},
): Promise<RulesetContent[]>;
```

#### `clearDefaultRulesetCache` (function)

> Clear the cached default rulesets (tests only).

```ts
function clearDefaultRulesetCache(): void;
```

#### `getCachedDefaultRulesets` (function)

> Resolve the bundled upstream-like remote defaults, caching the result with
> a TTL and single-flight so concurrent conversions share one fetch batch.
> Falls back to the bundled offline rules when fetching fails.

```ts
async function getCachedDefaultRulesets(): Promise<RulesetContent[]>;
```

#### `collectNodes` (function)

> Load every source and merge the resulting nodes.

```ts
async function collectNodes(sources: SubscriptionSource[]): Promise<Proxy[]>;
```

#### `prepareConversion` (function)

> Build the generation input for a `ConvertRequest`.

```ts
async function prepareConversion(request: ConvertRequest): Promise<ConvertInput>;
```

#### `buildCountryResolver` (function)

> GeoIP-resolve every node's country and return a synchronous resolver for
> core preprocessing. A missing database is an error: silently dropping the
> prefix would be confusing, so callers surface it.

```ts
async function buildCountryResolver(
  nodes: Proxy[],
  geoipPath: string,
): Promise<(node: Proxy) => string | undefined>;
```

#### `defaultRequestSettings` (function)

> Default `RequestSettings` derived from a conversion target.

```ts
function defaultRequestSettings(target: TargetFormat): RequestSettings;
```

### @subconverter/node: geoip

Source: [`./src/geoip.ts`](../packages/node/src/geoip.ts)

#### `clearGeoIpCache` (function)

> Drop cached GeoIP handles (tests only).

```ts
function clearGeoIpCache(): void;
```

#### `countryResolverFrom` (function)

> Build a synchronous core resolver from a precomputed code map.

```ts
function countryResolverFrom(codes: Map<Proxy, string>): (node: Proxy) => string | undefined;
```

#### `getGeoIpDatabase` (function)

> Open (and cache) a GeoIP database by path so repeated conversions reuse it.

```ts
function getGeoIpDatabase(path: string): Promise<GeoIpDatabase>;
```

#### `isHostIp` (function)

> `true` when the host is an IP literal (rather than a domain name).

```ts
function isHostIp(host: string): boolean;
```

#### `openGeoIpDatabase` (function)

> Open a local MaxMind GeoLite2/GeoIP2 `.mmdb` database (Country or City).
>
> `maxmind` loads the whole file into memory with an LRU decode cache, so the
> returned handle should be created once per process and reused.

```ts
async function openGeoIpDatabase(path: string): Promise<GeoIpDatabase>;
```

#### `resolveNodeCountries` (function)

> Resolve a country code for every node by its server IP.
>
> Literal IPs are looked up directly; domain names are resolved once per
> hostname (cached for the whole call). Unresolvable hosts and unknown IPs are
> skipped, leaving the node name untouched.

```ts
async function resolveNodeCountries(
  nodes: Proxy[],
  database: GeoIpDatabase,
  options: ResolveCountryOptions = {},
): Promise<Map<Proxy, string>>;
```

#### `GeoIpDatabase` (interface)

> Minimal GeoIP surface used by the country-prefix feature (mockable in tests).

```ts
interface GeoIpDatabase
```

Members:

- `lookupCountry` (`(ip: string) => string | undefined`, required) — ISO 3166-1 alpha-2 country code for an IP literal, or `undefined`.

#### `ResolveCountryOptions` (interface)

> Options for `resolveNodeCountries`.

```ts
interface ResolveCountryOptions
```

Members:

- `lookup` (`(host: string) => Promise<string[]>`, optional) — DNS lookup override (tests). Defaults to `node:dns/promises`.

### @subconverter/node: server

Source: [`./src/server.ts`](../packages/node/src/server.ts)

#### `collectRequestUrls` (function)

> Collect every `url` value from the raw query string, splitting `|`
> lists. Parses `rawQuery` with core `getAllUrlArgs` (not `URLSearchParams`)
> so `+`/`%2B`/case variants decode exactly as the rest of the request
> path does.

```ts
function collectRequestUrls(rawQuery: string): string[];
```

#### `contentTypeForTarget` (function)

> Map a target to its response `Content-Type`.

```ts
function contentTypeForTarget(target: string): string;
```

#### `convertSubRequest` (function)

> Convert one `/sub` query into a response body plus headers.
> Pure against `fetch` (stubbed in tests); the HTTP layer only maps it.

```ts
async function convertSubRequest(
  rawQuery: string,
  _searchParams: URLSearchParams,
  options: SubServerOptions = {},
): Promise<SubConversion>;
```

#### `createSubServer` (function)

> Create (but do not start) the subconverter HTTP server.

```ts
function createSubServer(options: SubServerOptions = {}): Server;
```

#### `fetchSubscriptionDetailed` (function)

> Fetch a subscription body while capturing quota/refresh headers.

```ts
async function fetchSubscriptionDetailed(
  url: string,
): Promise<{ body: string; profileUpdateInterval?: string; userinfo?: string }>;
```

#### `fetchUserinfoHeader` (function)

> Fetch a `userinfo_url` endpoint and convert it into a
> `subscription-userinfo` header value (`jms` handles Just-My-Socks JSON).

```ts
async function fetchUserinfoHeader(
  userinfoUrl: string,
  provider?: string,
): Promise<string | undefined>;
```

#### `splitSubscriptionUrls` (function)

> Split a `url` query value into individual subscription URLs.

```ts
function splitSubscriptionUrls(raw: string): string[];
```

#### `startServer` (function)

> Start the HTTP server and resolve once listening.

```ts
async function startServer(options: ServeOptions = {}): Promise<Server>;
```

#### `ServeOptions` (interface)

> Options for `startServer`.

```ts
interface ServeOptions
```

Members:

- `host` (`string`, optional) — Bind address (default `0.0.0.0` for Docker; use `127.0.0.1` locally).
- `port` (`number`, optional) — TCP port to listen on (default `25500`).
- `geoipPath` (`string`, optional) — Local MaxMind `.mmdb` database enabling `auto_country` (GeoIP country prefixed names). Local paths are only accepted here, never from a query.

#### `SubConversion` (interface)

> Result of converting one `/sub` HTTP request.

```ts
interface SubConversion
```

Members:

- `body` (`string`, required)
- `contentType` (`string`, required)
- `filename` (`string`, required)
- `profileUpdateInterval` (`string`, optional)
- `userinfo` (`string`, optional)

## @subconverter/browser

Browser build: ESM plus the IIFE global `SubConverter`.

Builds from: [`packages/browser/src/index.ts`](../packages/browser/src/index.ts).

Modules:

- [`(entry point)`](#subconverterbrowser-entry-point): `fetchSubscription`, `loadNodes`

### @subconverter/browser: (entry point)

Source: [`./src/index.ts`](../packages/browser/src/index.ts)

#### `fetchSubscription` (function)

> Fetch a remote subscription body in the browser.

```ts
async function fetchSubscription(url: string, init?: RequestInit): Promise<string>;
```

#### `loadNodes` (function)

> Fetch and parse a subscription URL into nodes.

```ts
async function loadNodes(url: string, init?: RequestInit): Promise<Proxy[]>;
```

## @subconverter/cli

Command-line interface.

Builds from: [`packages/cli/src/index.ts`](../packages/cli/src/index.ts).

Modules:

- [`(entry point)`](#subconvertercli-entry-point): `runCli`, `isKnownType`

### @subconverter/cli: (entry point)

Source: [`./src/index.ts`](../packages/cli/src/index.ts)

#### `runCli` (function)

> Entry point for the CLI. Returns a process exit code.

```ts
async function runCli(argv: string[]): Promise<number>;
```

#### `isKnownType` (function)

> `true` when `node.type` names a known proxy type (helper for consumers).

```ts
function isKnownType(type: string): boolean;
```
