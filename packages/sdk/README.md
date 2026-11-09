# @uniquedomains/sdk

A typed Node client for the [Unique Domains API](https://unique.domains/api): domain names, words, endings, registrar prices, the domain market, trends and the agenda. Most of it answers without a key.

```bash
npm install @uniquedomains/sdk
```

Node 20 or later. ESM and CommonJS.

## The first call

<!-- example: first-call -->
```js
import { createClient } from '@uniquedomains/sdk';

const ud = createClient();
const name = await ud.names.get('harbor.io');
console.log(name.status);
```

A method answers the API's `data`, typed from its OpenAPI document. The methods are grouped by what they read: `names`, `words`, `domains`, `tlds`, `prices` (registrars, venues and IANA too), `market`, `trends`, `agenda`, `editions` and `meta`. Your editor lists each group's methods, each with an example.

Without a key you read the free endpoints, within a limit per hour and per day from one address. The [API page](https://unique.domains/api) gives the figures.

The examples below continue from this one: `ud` is the client created here. Those that need another client give it its own name.

## A name's registry record

<!-- example: registry -->
```js
const record = await ud.names.registry('harbor.io');
console.log(record.registrar, record.expiresAt);
```

## What registrars charge for an ending

<!-- example: tld-prices -->
```js
const prices = await ud.prices.tld('io');
for (const row of prices) console.log(row.name, row.purchasePrice, row.renewalPrice);
```

## Every page of a list

`await` on a list answers its first page. Loop over the call instead and the client fetches the next page when the rows of the current one run out, until the last page:

<!-- example: every-row -->
```js
for await (const ending of ud.tlds.list({ publicSet: true, limit: 2, fields: ['tld', 'kind'] })) {
    console.log(ending.tld, ending.kind);
}
```

`limit` is the size of a page. `maxRows` stops the loop after that many rows. `.pages()` walks whole pages, with their `meta`:

<!-- example: pages -->
```js
for await (const page of ud.tlds.list({ publicSet: true, limit: 2, fields: ['tld', 'kind'], maxRows: 4 }).pages()) {
    console.log(page.data.length, page.meta.cursor);
}
```

## The whole answer

`.withMeta()` answers everything the API sent: `data`, `meta` and `links`, plus what the headers said: `etag`, `rateLimit` (the keyless window), `quota` (a member key's month), `retryAfter`, `location` and `headers` itself.

<!-- example: with-meta -->
```js
const { data, meta, links, etag, rateLimit } = await ud.names.get('harbor.io').withMeta();
console.log(data.status, meta.asOf, links.self, etag, rateLimit?.remaining);
```

A call is sent once, when it is first awaited or looped over. Awaiting it again, or asking for `.withMeta()` after, reads the same answer. A call never awaited is never sent, a POST included.

## Errors

An answer that is not a success throws an `ApiProblemError`, or one of its kinds, chosen by the problem's code:

<!-- example: errors -->
```js
import { ApiProblemError, PlanRequiredError, RateLimitError } from '@uniquedomains/sdk';

try {
    await ud.names.prices('harbor.io');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else if (error instanceof RateLimitError) console.log('Wait', error.retryAfter, 'seconds');
    else if (error instanceof ApiProblemError) console.log(error.status, error.code, error.detail);
    else throw error;
}
```

| Kind | Codes |
|---|---|
| `RateLimitError` | `rate_limited`: wait `retryAfter` seconds |
| `QuotaError` | `quota_spent`, `budget_spent`, `consumer_day_cap`, `intake_day_cap` |
| `PlanRequiredError` | `keyed_only`, `plan_required`: `product` says where to get it |
| `NotFoundError` | `not_found` |
| `ValidationError` | `validation_failed`, `cursor_invalid`, `unsupported_field`, `unsupported_format` |
| `AuthError` | `invalid_key`, `invalid_proxy_secret`, `listing_mismatch` |
| `NotReadyError` | `not_ready`, `check_unavailable`, `gate_unavailable` |
| `WordRejectedError` | `invalid_word`, `disabled_in_catalog`, `not_a_word`, `brand`, `offensive` |

Every kind is an `ApiProblemError`, with `status`, `code`, `detail`, `retryAfter`, `product`, `quota`, `rateLimit` and the whole problem body in `problem` (with members such as `reason` and `suggestion`). Any other code stays a plain `ApiProblemError`. An app that loads the SDK both with `import` and with `require` holds two copies of each class, so `instanceof` fails across them: compare `error.code` there. `code` is `unexpected_response` when the answer was not the API's: an error without a problem body (a RapidAPI refusal, a proxy's page) or a success that is not the API's JSON. Its message is in `detail` and the body in `error.problem.raw`. A network failure stays the runtime's own error from `fetch`.

## Retry

<!-- example: retry -->
```js
const patient = createClient({ retry: true });
const answer = await patient.names.get('harbor.io');
console.log(answer.status);
```

With `retry`, the client tries a call again after a `rate_limited` answer whose `Retry-After` is short enough, a 503 `not_ready` or `check_unavailable`, a 5xx without a problem body, and a network failure. It waits the `Retry-After` when the answer gives one, otherwise a random time within a limit that doubles at each try. A POST is tried again only after the `rate_limited` answer, where the API refused the call without running it. `retry: true` tries a call up to 3 times and waits at most 30 seconds before each new try; `retry: { attempts: 5, maxDelayMs: 10_000 }` changes both.

Without `retry`, the client tries again once, after a `rate_limited` answer with `Retry-After: 1`. Any other wait is yours to decide, so it throws.

## A member key

The Founder and Investor plans include the API with a key of your own. Create it in the product under Settings, Account, API.

<!-- example: member-key fixture -->
```js
const member = createClient({ apiKey: process.env.UD_API_KEY });
const key = await member.meta.key();
console.log(key.plan, key.calls);
```

`createClient()` reads `UD_API_KEY` by itself; pass `apiKey: null` to call without a key even when it is set. Keep the key on a server: a page a visitor loads shows it to everyone.

A member key's answers carry its month in `quota` (from `.withMeta()`): `limit`, `remaining`, `resetsAt`, and the metered unit a call spends (`unit`). `ud.meta.key()` reads the key's plan and month without spending a call.

## A RapidAPI key

The API is also on RapidAPI as sixteen listings, each on its own host. Pass your RapidAPI key and the listing it subscribes to:

<!-- example: rapidapi fixture -->
```js
const rapid = createClient({ rapidApi: { key: process.env.RAPIDAPI_KEY, listing: 'whois' } });
const listed = await rapid.names.registry('harbor.io');
console.log(listed.registrar);
```

A listing serves its own operations and the shared `/meta` and `/editions` paths. Calling another operation throws `ListingMismatchError` before any request, with the listings that serve it in `servedBy`. `LISTINGS` holds each listing's id, host and operations.

## `request`, for tools and loops

Every method is one operation of the API, and `request` calls an operation by its id, the name on the [API reference](https://unique.domains/api). It answers the whole envelope with its facts, as `.withMeta()` does. `OPERATIONS` lists every id with its method, path, parameters and access, and `NAMESPACE_METHODS` maps each method to its id.

<!-- example: request -->
```js
const answer = await ud.request('get_name', { path: { name: 'harbor.io' } });
console.log(answer.data.status, answer.etag);
```

When the id is only known at run time (a command or tool loop), use `requestOperation`. It makes the same call and answers one of three kinds to narrow. Before the call it checks the format, `fields`, `include` and dot path values against `OPERATIONS`. It does not check the other parameters: a misspelled, missing or wrongly typed one goes to the API, which answers 400 `validation_failed`.

<!-- example: request-operation -->
```js
import { isOperationId } from '@uniquedomains/sdk';

const id = 'list_tlds';
if (isOperationId(id)) {
    const answer = await ud.requestOperation(id, { query: { limit: 3 } });
    if (answer.notModified) console.log('unchanged');
    else if ('text' in answer) console.log(answer.text);
    else console.log(answer.data);
}
```

## Formats, fields and caching

`fields` keeps some top-level keys of an answer and `include` adds optional blocks, where the operation offers them. Both go in a method's options. With `fields`, the answer is still typed as the whole row: a key you did not keep is missing at run time.

<!-- example: include fixture -->
```js
const endings = await ud.words.endings('harbor', { include: ['cheapest'] });
console.log(endings.endings);
```

The `.csv` form of a list and the `If-None-Match` question go through `request`, since their answers carry no `data`:

<!-- example: csv -->
```js
const csv = await ud.request('list_tlds', { query: { limit: 3 }, format: 'csv' });
console.log(csv.text);
```

<!-- example: etag -->
```js
const first = await ud.names.get('harbor.io').withMeta();
const again = await ud.request('get_name', { path: { name: 'harbor.io' }, ifNoneMatch: first.etag });
console.log(again.notModified ? 'unchanged' : again.data.status);
```

`ifNoneMatch` is the one way to send `If-None-Match`; the header is removed from `headers`. The calendar feeds (`ud.meta.eventsIcs()`, `ud.meta.agendaIcs()`), `ud.meta.llmsTxt()` and `ud.meta.openapi()` answer their text.

## Links

An answer's `links` say where to go next. A name you can buy carries `links.register`, the registrar's page for it; a list served by a public dataset carries `links.dataset`. The SDK prints nothing; the CLI shows both under its tables.

## The datasets

Some lists are also public datasets on GitHub, refreshed by the same scanner (`ud.meta.datasets()` reads this list):

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
