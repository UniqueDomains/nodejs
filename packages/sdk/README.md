# @uniquedomains/sdk

A typed Node client for the [Unique Domains API](https://unique.domains/api): domain names, words, endings, registrar prices, the domain market, trends and the agenda. Every call is named by its operation id, and its parameters and answer are typed from the API's OpenAPI document.

```bash
npm install @uniquedomains/sdk
```

Node 20 or later. ESM and CommonJS.

## The free call

```js
import { createClient } from '@uniquedomains/sdk';

const ud = createClient();

const name = await ud.request('get_name', { path: { name: 'harbor.io' } });
console.log(name.data.status, name.data.price.firstYear);

const endings = await ud.request('list_tlds', { query: { publicSet: true, limit: 20 } });
console.log(endings.data.map((row) => row.tld));
```

Every answer is the API's envelope, `data`, `meta` and `links`, plus what its headers said: `status`, `etag`, `quota`, `rateLimit`, `retryAfter` and `location`. A list carries `meta.cursor`; pass it back as `query.cursor` for the next page.

The operation ids are the names on the [API reference](https://unique.domains/api). `OPERATIONS` lists them all with their method, path, parameters and access. A misspelled parameter is a compile error.

When the operation id is only known at run time (a command or tool loop), use `requestOperation`. It makes the same call, checks the params against `OPERATIONS` at run time, and answers one of the three kinds to narrow:

```js
import { isOperationId } from '@uniquedomains/sdk';

if (isOperationId(id)) {
    const answer = await ud.requestOperation(id, { path, query });
    if (answer.notModified) { /* a 304 */ }
    else if ('text' in answer) console.log(answer.text);
    else console.log(answer.data);
}
```

## A member key

The Founder and Investor plans include the API with a key of your own. Create it in the product under Settings, Account, API.

```js
const ud = createClient({ apiKey: 'ud_live_...' });
```

Or set `UD_API_KEY` and call `createClient()`. Pass `apiKey: null` to call without a key even when `UD_API_KEY` is set.

A member key's answers carry its month in `quota`: `limit`, `remaining`, `resetsAt`, and the metered unit a call spends (`unit`). `request('get_key')` reads the key's plan and month without spending a call.

## A RapidAPI key

The API is also on RapidAPI as sixteen listings, each on its own host. Pass your RapidAPI key and the listing it subscribes to:

```js
const ud = createClient({ rapidApi: { key: process.env.RAPIDAPI_KEY, listing: 'whois' } });
const record = await ud.request('get_name_registry', { path: { name: 'harbor.io' } });
```

A listing serves its own operations and the shared `/meta` and `/editions` paths. Calling another operation throws `ListingMismatchError` before any request, with the listings that serve it in `servedBy`. `LISTINGS` holds each listing's id, host and operations.

## Errors

Every answer that is not a success throws `ApiProblemError`, read from the API's problem body:

```js
import { ApiProblemError } from '@uniquedomains/sdk';

try {
    await ud.request('get_name_prices', { path: { name: 'harbor.io' } });
} catch (error) {
    if (error instanceof ApiProblemError) {
        console.log(error.status, error.code, error.detail);
        // error.product: where to get what was refused, on a plan or tier refusal
        // error.retryAfter: seconds to wait, on a 429 or a 503
        // error.problem: the whole body, with members such as reason and suggestion
    }
}
```

`code` is one of the API's problem codes (`validation_failed`, `keyed_only`, `plan_required`, `rate_limited`, `quota_spent`, `not_found` and the rest), or `unexpected_response` when the answer was not the API's: an error without a problem body (a RapidAPI refusal, a proxy's page) or a success that is not the API's JSON. Its message is in `detail` and the body in `error.problem.raw`. A network failure stays the runtime's own error from `fetch`.

The client retries once by itself, after a `rate_limited` answer with `Retry-After: 1`. Any other wait is yours to decide, so it throws.

## Formats, fields and caching

```js
// The .csv form, on the list endpoints that have one
const csv = await ud.request('list_tlds', { query: { limit: 100 }, format: 'csv' });
console.log(csv.text);

// Keep some top-level keys, or add optional blocks, where the operation offers them
await ud.request('get_name', { path: { name: 'harbor.io' }, fields: ['name', 'status', 'price'] });
await ud.request('get_word_endings', { path: { word: 'harbor' }, include: ['cheapest'] });

// Ask again only when the answer changed
const first = await ud.request('get_name', { path: { name: 'harbor.io' } });
const again = await ud.request('get_name', { path: { name: 'harbor.io' }, ifNoneMatch: first.etag });
if (again.notModified) console.log('unchanged');
```

With `fields`, the answer is still typed as the whole row: a key you did not keep is missing at run time. `ifNoneMatch` is the one way to send `If-None-Match`; the header is removed from `headers`. The calendar feeds (`get_events_ics`, `get_agenda_ics`), `get_llms_txt` and `get_openapi` answer text in `text`.

## Links

An answer's `links` say where to go next. A name you can buy carries `links.register`, the registrar's page for it; a list served by a public dataset carries `links.dataset`. The SDK prints nothing; the CLI shows both under its tables.

## The datasets

Some lists are also public datasets on GitHub, refreshed by the same scanner (`request('list_meta_datasets')` reads this list):

| Dataset | Endpoint |
|---|---|
| [oneword-domains](https://github.com/UniqueDomains/oneword-domains) | `/domains` |
| [expired-oneword-domains](https://github.com/UniqueDomains/expired-oneword-domains) | `/domains?status=expired` |
| [expiring-oneword-domains](https://github.com/UniqueDomains/expiring-oneword-domains) | `/domains/expiring` |
| [trending-domains-business-ideas](https://github.com/UniqueDomains/trending-domains-business-ideas) | `/editions/{persona}/latest` |
| [new-gtld-applications-2026](https://github.com/UniqueDomains/new-gtld-applications-2026) | `/tld-applications` |

## The OpenAPI document

The document this version was built from ships with the package as `@uniquedomains/sdk/openapi.json`. The live one is at `https://api.unique.domains/v1/meta/openapi.json`.

## Also

- [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli): the same API from the command line.
- `@uniquedomains/mcp-server`: the same API as tools for AI assistants, coming next in its own repository.

MIT
