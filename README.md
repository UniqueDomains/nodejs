# Domain name API for Node.js, by Unique.domains

One line, no key, a real answer:

```bash
npx @uniquedomains/cli get-name get.plumbing
```

```json
{
  "name": "get.plumbing",
  "status": "registered",
  "registry": {
    "createdAt": "2020-06-03",
    "expiresAt": "2027-06-03",
    "registrar": { "name": "GoDaddy.com, LLC", "ianaId": 146 }
  },
  "comps": { "count": 10, "medianUsd": 2677 }
}
```

That answer (trimmed) comes from a record Unique.domains reads every day: 34 million one-word names on [505 endings](https://unique.domains/tld), [nine registrars' price lists](https://unique.domains/registrars) and [seven auction venues](https://unique.domains/auctions). All of it is one `npm install` away. To see an answer with no code at all, [check a name on unique.domains](https://unique.domains/availability).

The API has 87 operations. 62 answer with no key, within 60 calls an hour and 100 a day from one address.

This repository holds nine packages. The first two are generated from the API's OpenAPI document and cover all of it; the other seven each answer one question, from code or as a command:

| Package | What it is |
| --- | --- |
| [`domain-name-api`](packages/sdk) | A typed client. Methods grouped by what they read (`ud.names.get`, `ud.prices.tld`, ...), each answering the API's data. |
| [`@uniquedomains/cli`](packages/cli) | The `ud` command. Every operation is a command: `get_name` is `ud get-name`. |
| [`@uniquedomains/whois`](packages/whois) | WHOIS lookup: a name's registry record, its DNS and its past records. The `ud-whois` command. |
| [`domain-availability`](packages/domain-availability) | Availability check: a name's status, its price and the day it comes free, for one name or a list, with a live check. The `ud-availability` command. |
| [`registrar-prices`](packages/registrar-prices) | Registrar prices: every registrar's price for an ending, the cheapest across endings, price history, changes and renewal traps. The `ud-prices` command. |
| [`domain-appraisal`](packages/domain-appraisal) | Appraisal: a name's estimated value and what similar names sold for. The `ud-appraise` command. |
| [`expired-domains-api`](packages/expired-domains-api) | Expired domains: the names expiring and dropping each day, by ending. The `ud-expired` command. |
| [`domain-sales`](packages/domain-sales) | Domain sales: counts and medians by word, ending and name length. The `ud-sales` command. |
| [`domain-auctions`](packages/domain-auctions) | Domain auctions: the day's closings and bids at seven venues, their rules and past outcomes. The `ud-auctions` command. |

[`examples/`](examples) holds three starters: a [Next.js page](examples/nextjs-domain-search), a [Google Sheets function](examples/google-sheets) and an [availability widget](examples/availability-widget).

```bash
npx @uniquedomains/cli get-name get.plumbing
```

<!-- example: first-call -->
```js
import { createClient } from 'domain-name-api';

const ud = createClient();
const name = await ud.names.get('get.plumbing');
console.log(name.status);
```

Continuing with that `ud`, a list loops over every page by itself:

<!-- example: every-row -->
```js
for await (const ending of ud.tlds.list({ publicSet: true, limit: 2, fields: ['tld', 'kind'] })) {
    console.log(ending.tld);
}
```

The [SDK's README](packages/sdk) covers the rest: the whole answer, typed errors, the retry option and `request` for tools.

## Keys

Without a key you read the free endpoints, within a limit per hour and per day. Two ways go further:

- **A member key.** The Founder and Investor plans include the API with a key of your own. Create it in the product under Settings, Account, API, then set `UD_API_KEY`.
- **A RapidAPI subscription.** The API is also on RapidAPI as sixteen listings. Pass your RapidAPI key with the listing it subscribes to.

Keep a key on a server: a page a visitor loads shows it to everyone. What each plan includes is on the [API page](https://unique.domains/api).

## Also from Unique.domains

- [The API reference](https://unique.domains/api): every endpoint, with examples.
- [The datasets](https://github.com/UniqueDomains): one-word domain names, expiring names, the daily editions and the new gTLD applications, as files on GitHub.
- [`@uniquedomains/mcp-server`](https://www.npmjs.com/package/@uniquedomains/mcp-server): the same API as tools for AI assistants, through the Model Context Protocol, in [its own repository](https://github.com/UniqueDomains/mcp-server) in this organization.

## Working on this repository

```bash
npm install
npm run build
npm test
```

- `npm run generate` fetches the live document and the sixteen listing documents into `openapi/` and regenerates `packages/sdk/src/generated/`. `npm run generate -- --check` fails when the snapshot differs from the live document; `--offline` regenerates from the snapshot alone.
- `npm run check:text` holds the repository to its writing rules.
- `npm run check:pack` packs every package, installs them in an empty folder, loads them, and runs the SDK README's first example, each use-case package's first function and each bin against the fixture server.
- `npm test` also runs every README example against the fixture server (`test/support/fixture-server.mjs`). Every `js` block of a README follows a marker, `<!-- example: <name> -->`; `fixture` after the name runs it against the fixture server only (a key the nightly job does not hold, or a keyless call kept off the nightly job's hourly window of 60 calls), `skip` never runs it (at most three a README). `scripts/readme-examples.mjs` extracts them into `test/readme/`.
- `npm run examples:live` runs the README examples not marked `fixture` against the live free API, keyless.
- `node scripts/record-fixtures.mjs --only <names>` records fixtures from the live free API, spending only their calls.
- `npm run smoke` runs the built CLI against the live free API, then five of the seven use-case packages through `npx` under their names on npm, from their packed tarballs: `expired-domains-api` and `domain-auctions` run through `npx` in `npm run check:pack`, against the fixture server, to keep the nightly job under its hourly window.
- A tag `v<version>` publishes every package from GitHub Actions with provenance, the SDK first. The packages share one version, and a tag never carries a pre-release.
- A new package first gets a placeholder `0.0.1` from `node scripts/publish-placeholder.mjs` (`--dry-run` to see it), since npm sets up trusted publishing only for a package that exists; the tag then publishes its real version with provenance.
- A publish by hand, `npm publish --workspace packages/<folder>`, builds the package first through its `prepack` script. The SDK goes first: the others depend on it.
- `shared/usecase/` is bundled into the seven use-case packages by their builds; it is not a package of its own.

## License

MIT
