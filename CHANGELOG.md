# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions adhere to
[Semantic Versioning](https://semver.org/). All four packages are released in lockstep; the
root `package.json` version is the source of truth.

Entries are written by hand, following Conventional Commits and grouped by release; the
`RELEASE` workflow (see [README](README.md#release)) generates the GitHub release notes from
the same commits.

## [Unreleased]

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

[Unreleased]: https://github.com/jinganix/subconverter/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/jinganix/subconverter/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jinganix/subconverter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jinganix/subconverter/releases/tag/v0.1.0
