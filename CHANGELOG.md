# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions adhere to
[Semantic Versioning](https://semver.org/). All four packages are released in lockstep; the
root `package.json` version is the source of truth.

Entries are written by hand, following Conventional Commits and grouped by release; the
`RELEASE` workflow (see [README](README.md#release)) generates the GitHub release notes from
the same commits.

## [Unreleased]

### Changed

- `packages/node` and `packages/cli` declare `engines.node >= 22` like the root package.
- Upstream-parity-only settings (`clashScript`, `managedConfigPrefix`, `quanxDevId`,
  `sortScript`, `clashProxiesStyle`, `clashProxyGroupsStyle`, `authorized`) are documented as
  accepted-but-inert instead of looking functional.

### Fixed

- A subscription/config JSON with `null` (or scalar) entries in `servers`, `configs`,
  `subItem`/`vmess`, or `Server` arrays crashed the whole parse; non-object entries are now
  skipped. Entries without a `server`/`address` no longer become empty nodes.
- `!!GROUPID=`/`!!INSERT=` rules never matched a specific source: nodes from the Nth `url`
  now carry group id N (`parseSubscription(content, groupId)`, `loadNodes(source, groupId)`;
  the server and CLI tag each fetched source). Previously every node had group id `0`.
- `ssd://` output parsed `subscription-userinfo` only when separators were `"; "`; `;` without
  a space produced `null` traffic counters. Separator spacing is now ignored and the counters
  are parsed as integers.
- A WireGuard Clash `peer` without a port (endpoint without `:`) lost the last hostname
  character and invented a port.
- `/sub` returned a `Content-Disposition` with a mangled `filename` for non-ASCII names; it
  now sends an ASCII fallback plus RFC 5987 `filename*=UTF-8''…`.
- Proxy-group names (and `[]NAME` references) are sanitized like node remarks: `=` and line
  breaks no longer break (or inject lines into) Surge/Loon/QuanX/Mellow output.
- `--classical`, `--no-expand` and `--classical-ruleset` were missing from the CLI boolean
  flag list, so `convert --classical sub.txt` swallowed the positional and reported "No input
  provided". Booleans are now recognized before consumption, and `--filter-deprecated` is
  documented.
- Lines before the first `[section]` header in a base config (e.g. `--base`) were dropped by
  `parseRawIni`; they are preserved and rendered without a header.

## [0.5.0] - 2026-11-07

### Added

- `convertNodes(nodes, options)` returns `{ output, nodes }`, i.e. the generated config plus
  the nodes that survived rename/filter/dedupe/sort. `generate()` is now a thin wrapper over
  it.
- `getFirstUrlArg(query, ...keys)` in core (`firstArg` semantics: first non-empty
  `_`/`-` alias wins) is now the single implementation used by `/sub` parsing and the server.
- `stripBom()` in core; `parseSubscription`, `parseIni`, and `parseRawIni` strip a leading
  UTF-8 BOM.

### Changed

- `generate()` no longer mutates the node array it is given: preprocessing (rename, emoji,
  sort, filters, dedupe) runs on copies. Calling `generate()` twice with the same nodes now
  produces identical output (it used to prepend `[SS]` twice and mangle names).
- `startServer()` no longer writes to stdout; the CLI prints the `listening on` line.
- `npm run check` now also runs `format:check` and `knip` (unused files/exports/dependencies).

### Fixed

- Comments (`;`, `#`, `//`) are ignored by the INI reader, mirroring upstream `ini_reader`;
  previously `#foo_rule_base=...` style comments were read as keys.
- A subscription or config with a UTF-8 BOM lost its first entry (the BOM kept the first link
  from being recognized).
- A malformed `rename`/`name_regex` pattern (e.g. `*`, `(`) aborted the whole conversion
  (`/sub` answered 500, the CLI crashed); bad patterns are now skipped.
- Node remarks containing CR/LF broke the line-based Surge/Loon/QuanX/Quantumult output
  (the name could inject config lines); line breaks are collapsed, and inner quotes are
  neutralized when a comma forces quoting.
- `countryResolverFrom()` now resolves by hostname, so it still works after the engine
  copies nodes (`auto_country` prefixes kept disappearing with the new copy semantics).
- The `/sub` server applies `enable_rule_generator` / `overwrite_original_rules` from a
  `config=` INI, matching the CLI; a broken `config=` URL now fails the request instead of
  silently falling back to defaults.

### Removed

- `LoadOptions.proxy`, an option that was documented but never implemented (it silently did
  nothing). Proxy support needs a dispatcher, not a stubbed field.

## [0.4.0] - 2026-11-02

### Added

- subconverter-rs parity: `wireguard://` / `wg://`, `snell://`, `hysteria://`, `anytls://`
  links and their Clash / Surge parsers and emitters.
- Clash kernel flavors: `flavor=mihomo|premium|stash` (`--flavor`), dropping the node types
  and fields the kernel cannot load.
- `expand=false` keeps remote rulesets as `RULE-SET,url,group` references for
  Surge/Surfboard instead of inlining them; `classical` passes Clash `payload:` lists through
  verbatim.
- sing-box: rulesets become `route.rules` / `route.final`; SSR is dropped (no upstream
  implementation).
- `[template]` variables with `{{ var }}` interpolation applied to `baseConf`.
- Surge-family `#!MANAGED-CONFIG` header: `managed_config_prefix` / `--managed-prefix`,
  `interval`, and `strict`.
- `filename`, `dev_id`, `surge_version` (`ver`/`version`) request parameters; blocked
  `include` / `exclude` patterns are rejected with 400.

## [0.3.0] - 2026-11-02

### Changed

- Country prefixes are always the uppercase ISO code (`US-server1`), never a
  localized name. `countryLocale` / `--country-locale` and the `regionDisplayName` /
  `regionFlag` exports are gone; multilingual names are still recognized so existing
  names are never double-prefixed.

### Added

- Country filtering by GeoIP: `include_country` / `exclude_country` query params
  (repeatable, comma-separated), `--include-country` / `--exclude-country` CLI flags,
  and `include_country` / `exclude_country` INI keys. `include_country=US` keeps only
  US nodes (unknown countries dropped); `exclude_country=NL` drops Dutch nodes
  (unknown kept). Both need `--geoip`. Query `include` / `exclude` remark filters are
  now applied during generation as well.

## [0.2.1] - 2026-10-24

First release published to npm since 0.1.0: the 0.2.0 GitHub release and tag exist,
but its `RELEASE` run failed before the npm job, so `latest` on npm stayed at 0.1.0.

### Fixed

- Published packages now include `README.md` and `LICENSE`. The 0.1.0 tarballs shipped
  only `dist/` and `package.json`, so npmjs.com showed "This package does not have a
  README" and omitted the license text. npm does not read outside the package directory,
  so each workspace carries its own LICENSE copy.
- `npm run check:packages` fails when a tarball is missing its README, LICENSE, declared
  entry points, or when a package LICENSE drifts from the repository root.

### Added

- Node name cleanup before renaming: `name_regex` (regex replace with `$1` backrefs) and
  `name_remove` (literal fragments), applied ahead of rename/emoji/country/sort. Exposed via
  `--name-regex` / `--name-remove`, the `name_regex` / `name_remove` query params, and the
  `[custom]` INI keys of the same name.
- GeoIP country prefix for node names (`auto_country`) from a local MaxMind GeoLite2/GeoIP2
  database, via `--auto-country` + `--geoip <mmdb>` (CLI and server) and `buildCountryResolver`
  / `resolveNodeCountries` in `@subconverter/node`.
- `docs/API.md`, generated from the package barrels by `scripts/gen-api-docs.mjs`
  (`npm run docs:api`), covering every public symbol with signatures, enum members, and
  interface fields.
- `llms.txt` and this changelog.

### Changed

- `scripts/sync-versions.mjs` also rewrites the `Current release` / `当前版本` marker in
  both READMEs, and fails when that marker is missing.
- Compacted the README output-format, query-parameter, and quota tables into lists so no
  line exceeds 215 characters.
- Package READMEs rewritten with install, quick start, supported input/output, and API
  links for the npm package pages.

## [0.2.0] - 2026-10-17

### Added

- `/sub` HTTP server with the upstream query-parameter surface, `Content-Type` /
  `Content-Disposition` handling, CORS, size and URL limits, and `subscription-userinfo`
  forwarding.
- Quota conversion via `userinfo_url` / `userinfo_provider` (`auto`, `jms`, `subscription`).
- Rules on by default: bundled upstream-like default rulesets and proxy groups, with remote
  TTL + single-flight caching in `@subconverter/node` and offline fallback.
- Docker image and `docker-compose.yml` for server deployment.

### Changed

- Generators aligned with the frozen snapshot suite; broadened parser/generator matrices and
  coverage gates.

### Fixed

- Parser and generator edge cases surfaced by the frozen protocol/format matrices.

## [0.1.0] - 2026-10-16

### Added

- Initial release: isomorphic parsing of share links and client configs (Clash, Surge, Loon,
  ss/ssr/vmess/vless/trojan/hysteria2/tuic/anytls, `ssd://`, base64 lists) into one proxy model,
  and generation for Clash/ClashR, Surge, Surfboard, Quantumult, Quantumult X, Loon, Mellow,
  sing-box, SIP008, and share-link targets.
- Node.js, browser (ESM + IIFE `SubConverter`), and CLI packages.

[0.5.0]: https://github.com/jinganix/subconverter/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jinganix/subconverter/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jinganix/subconverter/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/jinganix/subconverter/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jinganix/subconverter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jinganix/subconverter/releases/tag/v0.1.0
