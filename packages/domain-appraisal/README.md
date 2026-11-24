# Domain appraisal for Node.js

What is a name worth, and what did similar names sell for? `await comparableSales('get.plumbing')` answers 10 similar sales with a median of $2,677, from 12 months of domain sales, about 40,000 of them. `appraisal()` gives the estimated value of a name and its past estimates. `comparableSales()` answers with no key and no sign-up. The newest sales and the market's totals are a page: [unique.domains/sales](https://unique.domains/sales).

```bash
npx domain-appraisal get.plumbing
```

```bash
npm install domain-appraisal
```

Node 20 or later. ESM and CommonJS.

One family on the [Unique.domains API](https://unique.domains/api): [`domain-name-api`](https://www.npmjs.com/package/domain-name-api) (every operation, typed), [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli) (the same from a terminal), [`domain-availability`](https://www.npmjs.com/package/domain-availability), [`registrar-prices`](https://www.npmjs.com/package/registrar-prices) and [`@uniquedomains/whois`](https://www.npmjs.com/package/@uniquedomains/whois).

Up to version 0.2.1 this package was published as `@uniquedomains/domain-appraisal`. Same code, same methods: switch every import at once, the two names do not share their error classes.

## Comparable sales

<!-- example: comparable-sales -->
```js
import { comparableSales } from 'domain-appraisal';

const sales = await comparableSales('get.plumbing');
console.log(sales.tier, sales.count, sales.medianUsd);
```

The answer is a summary, never a list of single sales: how close the sales are to the name (`tier`), how many there are, their median in USD, and on how many endings the word sold in the last 12 months. `same_word` means sales of the same word on other endings, `synonyms` and `related` sales of words close to it, and `market` sales across the whole ending when nothing closer exists, so read that one as the ending's going rate, not as similar names. `same_type` means sales of the same kind of name on the ending (a count and a median, no sale listed under it). With a key, `sold_before` also appears: this exact name sold before.

## The value

The value of a name and its last 20 estimates. It needs a key. `current` is `null` when the name has no estimate yet, and this call never starts one.

<!-- example: value fixture -->
```js
import { appraisal } from 'domain-appraisal';

const { current } = await appraisal('zorbly.io', { apiKey: process.env.UD_API_KEY });
console.log(current ? current.value : 'No estimate yet.');
```

Without a key, the call throws a `PlanRequiredError`:

<!-- example: refused -->
```js
import { appraisal, PlanRequiredError } from 'domain-appraisal';

try {
    await appraisal('zorbly.io');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## A new appraisal

Runs the appraisal when a catalog name's estimate is missing, and answers the value. It needs a key on the Investor plan. Appraisals are counted apart from your calls, in Appraisal units your plan or RapidAPI subscription includes each month: this spends one when this call starts a run, and none when it reuses an estimate. When another call holds the run, the API answers 202 with the answer so far, so `current` may be `null`: ask again in about 30 seconds. The name must be in the catalog already: [`check` in `domain-availability`](https://www.npmjs.com/package/domain-availability) adds it.

<!-- example: appraise fixture -->
```js
import { appraise } from 'domain-appraisal';

const { current } = await appraise('zorbly.io', { apiKey: process.env.UD_API_KEY });
console.log(current ? current.value : 'Still running: ask again in about 30 seconds.');
```

## The command

```bash
ud-appraise get.plumbing
ud-appraise zorbly.io --value --key ud_live_...
ud-appraise zorbly.io --run --key ud_live_...
```

A table on a terminal, JSON in a pipe. `ud-appraise --help` lists the flags.

## Keys and limits

Without a key you read the comparable sales, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and a new appraisal needs the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Appraisal on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-appraisal3) serves all three: pass `{ rapidApi: { key, listing: 'appraisal' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Domain appraisal API page](https://unique.domains/api/appraisal) shows the answer and its fields, and you can run the free call there.

## License

MIT
