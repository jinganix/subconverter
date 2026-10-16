# @subconverter/node

Node.js adapter of
[subconverter-ts](https://github.com/jinganix/subconverter): subscription loading
over `fetch`, filesystem reads/writes, and conversion helpers, on top of
`@subconverter/core`.

## Install

```bash
npm i @subconverter/node
```

## Use

```ts
import { fetchSubscription, loadNodes } from "@subconverter/node";
import { TargetFormat, generate } from "@subconverter/core";

// From a URL or a local file (both accepted as a SubscriptionSource)
const nodes = await loadNodes("https://example.com/sub");
const clash = generate(nodes, { target: TargetFormat.Clash });

// Lower-level primitives
const body = await fetchSubscription("https://example.com/sub");
```

## License

GPL-3.0
