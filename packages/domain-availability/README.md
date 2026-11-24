# Domain availability check for Node.js

Is `get.plumbing` available? `await availability('get.plumbing')` answers `registered` and `ownableNow: false`: taken, with no day set for it to come free. For a name nobody holds, the same call gives its price today and its renewal price; for a name on its way out, the day it is due to come free. `check()` runs a live check of one name, and `availabilityBatch()` answers for a whole list in one call. 37 million names, read every day. `availability()` answers with no key. To try a name with no code, use [unique.domains/availability](https://unique.domains/availability).

```bash
npx domain-availability get.plumbing
```

```bash
npm install domain-availability
```

Node 20 or later. ESM and CommonJS.

One family on the [Unique.domains API](https://unique.domains/api): [`domain-name-api`](https://www.npmjs.com/package/domain-name-api) (every operation, typed), [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli) (the same from a terminal), [`domain-appraisal`](https://www.npmjs.com/package/domain-appraisal), [`registrar-prices`](https://www.npmjs.com/package/registrar-prices), [`@uniquedomains/whois`](https://www.npmjs.com/package/@uniquedomains/whois), [`expired-domains-api`](https://www.npmjs.com/package/expired-domains-api), [`domain-sales`](https://www.npmjs.com/package/domain-sales) and [`domain-auctions`](https://www.npmjs.com/package/domain-auctions).

Up to version 0.2.1 this package was published as `@uniquedomains/domain-availability`. Same code, same methods: switch every import at once, the two names do not share their error classes.

## The answer

<!-- example: availability -->
```js
import { availability } from 'domain-availability';

const answer = await availability('get.plumbing');
console.log(answer.status, answer.ownableNow, answer.price.firstYear);
```

`status` says where the name stands, `ownableNow` whether it can be bought now, `drop` the day it is due to come free when one is known, and `price` what it costs for the first year and to renew. A name outside the catalog answers `tracked: false` and the status `not_checked`. That status also covers a taken name the catalog does not track, so it never means the name is free: that is when the live check helps.

## The live check

Runs a live check of the name and returns the full answer. It needs a key. Live checks are counted apart from your calls, in Live units your plan or RapidAPI subscription includes each month: this spends one when the check runs, also when it did not conclude.

<!-- example: check fixture -->
```js
import { check } from 'domain-availability';

const answer = await check('zorbly.io', { apiKey: process.env.UD_API_KEY });
console.log(answer.status, answer.checked);
```

`checked` is `false` when no live check ran and no unit was spent. When the check did not conclude, the API answers 202 with the answer so far, and `.withMeta()` carries that `status`. Without a key, the call throws a `PlanRequiredError`:

<!-- example: refused -->
```js
import { check, PlanRequiredError } from 'domain-availability';

try {
    await check('zorbly.io');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## Many names at once

Up to 100 names, with their answers in the order you sent them. It needs a key on the Investor plan, runs no live check, and is billed one call per name sent, the refused ones included.

<!-- example: batch fixture -->
```js
import { availabilityBatch } from 'domain-availability';

const answers = await availabilityBatch(['zorbly.io', 'zorbly.ai', 'foo@bar.com'], { apiKey: process.env.UD_API_KEY });
for (const answer of answers) console.log(answer.name, answer.error ?? answer.status ?? 'not in the catalog');
```

## The command

```bash
ud-availability get.plumbing
ud-availability zorbly.io --check --key ud_live_...
ud-availability zorbly.io zorbly.ai --key ud_live_...
```

A table on a terminal, JSON in a pipe. `ud-availability --help` lists the flags.

## Keys and limits

Without a key you read the answer, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and many names at once need the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Availability on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-availability14) serves all three: pass `{ rapidApi: { key, listing: 'availability' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Domain availability API page](https://unique.domains/api/availability) shows the answer and its fields, and you can run the call there.

## License

MIT
