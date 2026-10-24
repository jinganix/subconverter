# @subconverter/browser

Browser build of [subconverter-ts](https://github.com/jinganix/subconverter): convert
subscriptions entirely in the page, with no server round trip. Built on
[`@subconverter/core`](https://npmjs.com/package/@subconverter/core) and shipped as ESM
plus an IIFE global (`SubConverter`).

```bash
npm i @subconverter/browser
```

## Quick start

```ts
import { createExtraSettings, loadNodes, toClash } from "@subconverter/browser";

const nodes = await loadNodes("https://example.com/sub");
const clash = toClash(nodes, [], createExtraSettings());
```

`loadNodes` fetches and parses in one step; `toClash` / `toSurge` are the bundled
generators. Everything else (the full `parseSubscription`, `generate`, `TargetFormat`,
and all type exports) is re-exported from `@subconverter/core`.

## Script tag

```html
<script src="https://unpkg.com/@subconverter/browser/dist/subconverter.global.js"></script>
<script>
  const nodes = await SubConverter.loadNodes("https://example.com/sub");
</script>
```

The IIFE bundle exposes `SubConverter` on `window`.

## CORS

The browser build calls `fetch` directly, so the subscription host must allow cross-origin
requests. When it does not, run the [server from `@subconverter/node`](https://npmjs.com/package/@subconverter/node)
and point the browser at your own origin instead.

## Package size

The IIFE bundle is roughly 160 kB because it contains the whole conversion engine,
including every parser and generator. Import the ESM entry point to let a bundler drop
unused targets.

## API reference

Every public export with its signature, enum members, and interface fields:
[docs/API.md](https://github.com/jinganix/subconverter/blob/main/docs/API.md).

## License

GPL-3.0.
