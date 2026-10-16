# @subconverter/core

Platform-free conversion engine of
[subconverter-ts](https://github.com/jinganix/subconverter): subscription/config parsing,
node manipulation, and re-emission for Clash, Surge, Quantumult X, Loon, sing-box,
and share links. No Node built-ins, no DOM globals — runs anywhere.

## Install

```bash
npm i @subconverter/core
```

## Use

```ts
import { TargetFormat, generate, parseSubscription } from "@subconverter/core";

const nodes = parseSubscription(await response.text());
const clash = generate(nodes, { target: TargetFormat.Clash });
```

Supported inputs: `ss://`, `ssr://`, `vmess://`, `trojan://`, `hysteria2://` /
`hy2://`, `anytls://`, base64/plain subscription lists, `ssd://`, Clash YAML,
Surge/Loon INI, v2rayN JSON, and more. See the
[repo README](https://github.com/jinganix/subconverter) for the full matrix.

## License

GPL-3.0
