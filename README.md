# Unique Domains for Node

The Unique Domains API answers questions about domain names: whether a name is free, its registry record, what registrars charge for each ending, and what the domain market did. It covers names, words, endings, registrar prices, the market, trends and the industry agenda, and most of it works without a key.

This repository holds two packages, generated from the API's OpenAPI document:

| Package | What it is |
|---|---|
| [`@uniquedomains/sdk`](packages/sdk) | A typed client. Methods grouped by what they read (`ud.names.get`, `ud.prices.tld`, ...), each answering the API's data. |
| [`@uniquedomains/cli`](packages/cli) | The `ud` command. Every operation is a command: `get_name` is `ud get-name`. |

```bash
npx @uniquedomains/cli get-name harbor.io
```

<!-- example: first-call -->
```js
import { createClient } from '@uniquedomains/sdk';

const ud = createClient();
const name = await ud.names.get('harbor.io');
console.log(name.status);
```

A list loops over every page by itself:

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
- `npm run check:pack` packs both packages, installs them in an empty folder, loads them and runs the SDK README's first example against the fixture server.
- `npm test` also runs every README example against the fixture server (`test/support/fixture-server.mjs`). Every `js` block of a README follows a marker, `<!-- example: <name> -->`; `fixture` after the name runs it against the fixture server only (a key the nightly job does not hold), `skip` never runs it (at most three a README). `scripts/readme-examples.mjs` extracts them into `test/readme/`.
- `npm run examples:live` runs the README examples not marked `fixture` against the live free API, keyless.
- `node scripts/record-fixtures.mjs --only <names>` records fixtures from the live free API, spending only their calls.
- `npm run smoke` runs the built CLI against the live free API.
- A tag `v<version>` publishes both packages from GitHub Actions with provenance. The two packages share one version, and a tag never carries a pre-release.
- A publish by hand, `npm publish --workspace packages/sdk` then `--workspace packages/cli`, builds each package first through its `prepack` script.

## License

MIT
