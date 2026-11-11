# Unique Domains for Node

One line, no key, a real answer:

```bash
npx @uniquedomains/cli get-name get.plumbing
```

```json
{
  "name": "get.plumbing",
  "status": "for_sale",
  "registry": {
    "createdAt": "2020-06-03",
    "expiresAt": "2027-06-03",
    "registrar": { "name": "GoDaddy.com, LLC", "ianaId": 146 }
  },
  "comps": { "count": 10, "medianUsd": 2677 }
}
```

That answer (2026-11-11, trimmed) comes from a record Unique Domains reads every day: 37 million one-word names on 505 endings, nine registrars' price lists and seven auction venues. Building it yourself means a WHOIS and RDAP client for every registry and a price reader for every registrar. Here it is `npm install`.

The API has 87 operations. 62 answer with no key, within 60 calls an hour and 100 a day from one address.

This repository holds six packages. The first two are generated from the API's OpenAPI document and cover all of it; the other four each answer one question, from code or as a command:

| Package | What it is |
|---|---|
| [`@uniquedomains/sdk`](packages/sdk) | A typed client. Methods grouped by what they read (`ud.names.get`, `ud.prices.tld`, ...), each answering the API's data. |
| [`@uniquedomains/cli`](packages/cli) | The `ud` command. Every operation is a command: `get_name` is `ud get-name`. |
| [`@uniquedomains/whois`](packages/whois) | WHOIS lookup: a name's registry record and DNS for free, its past records with a key. The `ud-whois` command. |
| [`@uniquedomains/domain-availability`](packages/domain-availability) | Availability check: a name's stored status and price for free, a live check with a key. The `ud-availability` command. |
| [`@uniquedomains/registrar-prices`](packages/registrar-prices) | Price comparison: every registrar's price for an ending, renewal traps and changes for free, the cheapest across endings with a key. The `ud-prices` command. |
| [`@uniquedomains/domain-appraisal`](packages/domain-appraisal) | Appraisal: comparable sales for free, the value with a key. The `ud-appraise` command. |

[`examples/`](examples) holds three starters: a [Next.js page](examples/nextjs-domain-search), a [Google Sheets function](examples/google-sheets) and an [availability widget](examples/availability-widget).

```bash
npx @uniquedomains/cli get-name get.plumbing
```

<!-- example: first-call -->
```js
import { createClient } from '@uniquedomains/sdk';

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

## Also from Unique Domains

- [The API reference](https://unique.domains/api): every endpoint, with examples.
- [The datasets](https://github.com/UniqueDomains): one-word domain names, expiring names, the daily editions and the new gTLD applications, as files on GitHub.
- `@uniquedomains/mcp-server`: the same API as tools for AI assistants, through the Model Context Protocol. It is coming next, in its own repository in this organization.

## Working on this repository

```bash
npm install
npm run build
npm test
```

- `npm run generate` fetches the live document and the sixteen listing documents into `openapi/` and regenerates `packages/sdk/src/generated/`. `npm run generate -- --check` fails when the snapshot differs from the live document; `--offline` regenerates from the snapshot alone.
- `npm run check:text` holds the repository to its writing rules.
- `npm run check:pack` packs every package, installs them in an empty folder, loads them, and runs the SDK README's first example, each use-case package's first function and each bin against the fixture server.
- `npm test` also runs every README example against the fixture server (`test/support/fixture-server.mjs`). Every `js` block of a README follows a marker, `<!-- example: <name> -->`; `fixture` after the name runs it against the fixture server only (a key the nightly job does not hold), `skip` never runs it (at most three a README). `scripts/readme-examples.mjs` extracts them into `test/readme/`.
- `npm run examples:live` runs the README examples not marked `fixture` against the live free API, keyless.
- `node scripts/record-fixtures.mjs --only <names>` records fixtures from the live free API, spending only their calls.
- `npm run smoke` runs the built CLI against the live free API.
- A tag `v<version>` publishes every package from GitHub Actions with provenance, the SDK first. The packages share one version, and a tag never carries a pre-release.
- A new package first gets a placeholder `0.0.1` from `node scripts/publish-placeholder.mjs` (`--dry-run` to see it), since npm sets up trusted publishing only for a package that exists; the tag then publishes its real version with provenance.
- A publish by hand, `npm publish --workspace packages/<folder>`, builds the package first through its `prepack` script. The SDK goes first: the others depend on it.
- `shared/usecase/` is bundled into the four use-case packages by their builds; it is not a package of its own.

## License

MIT
