# Unique Domains for Node

The Unique Domains API answers questions about domain names: whether a name is free, its registry record, what registrars charge for each ending, and what the domain market did. It covers names, words, endings, registrar prices, the market, trends and the industry agenda, and most of it works without a key.

This repository holds two packages, generated from the API's OpenAPI document:

| Package | What it is |
|---|---|
| [`@uniquedomains/sdk`](packages/sdk) | A typed client. Every call is named by its operation id and typed from the document. |
| [`@uniquedomains/cli`](packages/cli) | The `ud` command. Every operation is a command: `get_name` is `ud get-name`. |

```bash
npx @uniquedomains/cli get-name harbor.io
```

```js
import { createClient } from '@uniquedomains/sdk';

const ud = createClient();
const { data } = await ud.request('get_name', { path: { name: 'harbor.io' } });
console.log(data.status);
```

## Keys

Without a key you read the free endpoints, within a limit per hour and per day. Two ways go further:

- **A member key.** The Founder and Investor plans include the API with a key of your own. Create it in the product under Settings, Account, API, then set `UD_API_KEY`.
- **A RapidAPI subscription.** The API is also on RapidAPI as sixteen listings. Pass your RapidAPI key with the listing it subscribes to.

What each plan includes is on the [API page](https://unique.domains/api).

## Also from Unique Domains

- [The API reference](https://unique.domains/api): every endpoint, with examples.
- [The datasets](https://github.com/UniqueDomains): one-word domain names, expiring names, the daily editions and the new gTLD applications, as files on GitHub.
- [`@uniquedomains/mcp-server`](https://github.com/UniqueDomains/mcp-server): the same API as tools for AI assistants, through the Model Context Protocol.

## Working on this repository

```bash
npm install
npm run build
npm test
```

- `npm run generate` fetches the live document and the sixteen listing documents into `openapi/` and regenerates `packages/sdk/src/generated/`. `npm run generate -- --check` fails when the snapshot differs from the live document; `--offline` regenerates from the snapshot alone.
- `npm run check:text` holds the repository to its writing rules.
- `npm run smoke` runs the built CLI against the live free API.
- A tag `v<version>` publishes both packages from GitHub Actions with provenance. The two packages share one version.

## License

MIT
