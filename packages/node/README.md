# @subconverter/node

Node.js adapter for [subconverter-ts](https://github.com/jinganix/subconverter):
subscription loading over `fetch`, filesystem reads and writes, GeoIP country lookup, and
an HTTP server that mirrors upstream subconverter's `/sub` endpoint. Built on
[`@subconverter/core`](https://npmjs.com/package/@subconverter/core).

```bash
npm i @subconverter/node
```

## Quick start

```ts
import { TargetFormat, generate } from "@subconverter/core";
import { loadNodes } from "@subconverter/node";

// A URL, a local path, or inline text — all accepted as a SubscriptionSource
const nodes = await loadNodes("https://example.com/sub");
const clash = generate(nodes, { target: TargetFormat.Clash });
```

## Loading

```ts
import { fetchSubscription, loadNodes, readSubscriptionFile } from "@subconverter/node";

const body = await fetchSubscription("https://example.com/sub", {
  headers: { "User-Agent": "my-client" },
  timeoutMs: 10_000,
});

const fromFile = await readSubscriptionFile("./sub.txt");

const nodes = await loadNodes({ kind: "text", text: body });
```

`fetchSubscription` enforces a 5 MB body cap (`MAX_FETCH_BYTES`) by default and rejects
non-2xx responses. `loadNodes` accepts `{ kind: "url" | "file" | "text" }`.

## Conversion pipeline

`prepareConversion` resolves rulesets, GeoIP, and settings in one step, then hands the
result to core `generate`:

```ts
import { TargetFormat, generate } from "@subconverter/core";
import { prepareConversion } from "@subconverter/node";

const input = await prepareConversion({
  sources: [{ kind: "url", url: "https://example.com/sub" }],
  target: TargetFormat.Clash,
  includeRules: false,
});
const out = generate(input.nodes, {
  groups: input.extraProxyGroup,
  includeRules: input.includeRules,
  rulesets: input.rulesets,
  settings: input.settings,
  target: input.target,
});
```

Default rulesets resolve through `getCachedDefaultRulesets` with a TTL and single-flight
fetch, falling back to bundled offline rules when the network is unavailable.

## GeoIP country prefix

```ts
import { buildCountryResolver } from "@subconverter/node";

const settings = {
  autoCountry: true,
  countryResolver: await buildCountryResolver(nodes, "./GeoLite2-Country.mmdb"),
};
```

Requires a local MaxMind GeoLite2/GeoIP2 `.mmdb` database. GeoIP lookups are cached per
hostname, and a missing database is an error rather than a silent no-op.

## HTTP server

```ts
import { startServer } from "@subconverter/node";

const server = await startServer({ host: "0.0.0.0", port: 25500 });
// GET /sub?target=clash&url=https://example.com/sub
```

The server serves `GET /sub`, `GET /version`, and a usage page at `GET /`. It enables
CORS, accepts at most five subscription URLs, applies a 15 s fetch timeout and a 5 MB body
cap, forwards `subscription-userinfo` / `profile-update-interval`, and converts quota via
`userinfo_url` / `userinfo_provider`. Only remote `http(s)` URLs are accepted for
`config`/`base`; inline `[]RULE` rulesets still work.

## API reference

Every public export with its signature, enum members, and interface fields:
[docs/API.md](https://github.com/jinganix/subconverter/blob/main/docs/API.md).

## License

GPL-3.0.
