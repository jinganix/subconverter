# @subconverter/cli

Command-line interface for [subconverter-ts](https://github.com/jinganix/subconverter):
convert proxy subscriptions between Clash, Surge, Quantumult X, Loon, sing-box, and share
link formats, or run an upstream-compatible `/sub` server.

```bash
npm i -g @subconverter/cli
```

## Quick start

```bash
# Remote subscription to Clash
subconverter convert --url https://example.com/sub --target clash --out clash.yaml

# Local file, with emoji and rename rules
subconverter convert --file sub.txt --target v2ray \
  --add-emoji --emoji 'HK@🇭🇰' --rename 'Netflix@NF'

# Inspect a single link
subconverter parse 'trojan://pw@1.2.3.4:443?sni=example.com#Node'

# List every output target
subconverter formats

# Serve /sub like upstream subconverter (default port 25500)
subconverter serve --port 25500 --host 0.0.0.0
```

## Commands

| Command   | Purpose                                                          |
| --------- | ---------------------------------------------------------------- |
| `convert` | Convert URLs, files, or piped stdin into a target format.        |
| `serve`   | Run the `/sub` HTTP server (`--geoip` enables country prefixes). |
| `parse`   | Print one line per share link: type, host:port, and remark.      |
| `formats` | Print every valid `--target` value, one per line.                |

## Common convert flags

- `--target <fmt>` — output format (default `clash`).
- `--out <path>` — write to a file instead of stdout.
- `--group <name>` — add a select group containing every node (repeatable).
- `--ruleset <group,url[,interval]>` — add a ruleset; repeatable.
- `--config <path|url>` — external `[custom]` INI, like upstream `config=`.
- `--base <path>` — base config merged under the generated proxies/groups/rules.
- `--name-regex <match@replace>` / `--name-remove <a,b>` — clean names before renaming.
- `--auto-country` with `--geoip <mmdb>` — prefix names that lack a country.
- `--no-rules` — strip rules and default groups (they are on by default).
- `--surge-version <n>` — Surge target version (default 5).

Run `subconverter --help` for the full list.

## Rules are on by default

Since 0.2.0, `convert` attaches rules and default proxy groups unless you pass
`--no-rules`. `--with-rules` is kept for compatibility and is implied.

## API reference

Every public export with its signature, enum members, and interface fields:
[docs/API.md](https://github.com/jinganix/subconverter/blob/main/docs/API.md).

## License

GPL-3.0.
