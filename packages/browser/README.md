# @subconverter/browser

In-page subscription converter of
[subconverter-ts](https://github.com/jinganix/subconverter), built on
`@subconverter/core`. Ships as ESM plus an IIFE global (`SubConverter`).

## Install

```bash
npm i @subconverter/browser
```

## Use

```ts
import { createExtraSettings, loadNodes, toClash } from "@subconverter/browser";

const nodes = await loadNodes("https://example.com/sub");
const clash = toClash(nodes, [], createExtraSettings());
```

Or via CDN as a global:

```html
<script src="https://unpkg.com/@subconverter/browser/dist/subconverter.global.js"></script>
<script>
  const nodes = await SubConverter.loadNodes("https://example.com/sub");
</script>
```

## License

GPL-3.0
