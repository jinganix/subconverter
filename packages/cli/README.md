# @subconverter/cli

Command-line interface of
[subconverter-ts](https://github.com/jinganix/subconverter). Converts proxy
subscriptions between Clash, Surge, Quantumult X, Loon, sing-box, and share-link
formats.

## Install

```bash
npm i -g @subconverter/cli
```

## Use

```bash
# Remote subscription to Clash
subconverter convert --url https://example.com/sub --target clash --out clash.yaml

# Local file, with emoji and rename rules
subconverter convert --file sub.txt --target v2ray \
  --add-emoji --emoji 'HK@🇭🇰' --rename 'Netflix@NF'

# Inspect a single link
subconverter parse 'trojan://pw@1.2.3.4:443?sni=example.com#Node'
```

Run `subconverter --help` for all targets and options.

## License

GPL-3.0
