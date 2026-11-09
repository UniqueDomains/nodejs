# Domain appraisal for Node.js

The value needs a key. The comparable sales are free: a summary of the sales behind a domain name, from Node.js or the command line, with no key and no sign-up.

```bash
npx @uniquedomains/domain-appraisal get.plumbing
```

```bash
npm install @uniquedomains/domain-appraisal
```

Node 20 or later. ESM and CommonJS. Built on [`@uniquedomains/sdk`](https://www.npmjs.com/package/@uniquedomains/sdk).

## Comparable sales

<!-- example: comparable-sales -->
```js
import { comparableSales } from '@uniquedomains/domain-appraisal';

const sales = await comparableSales('get.plumbing');
console.log(sales.tier, sales.count, sales.medianUsd);
```

The answer is a summary, never a list of single sales: how close the sales are to the name (`tier`), how many there are, their median in USD, and on how many endings the word sold in the last 12 months. `same_word` means sales of the same word on other endings, `synonyms` and `related` sales of words close to it, and `market` sales across the whole ending when nothing closer exists, so read that one as the ending's going rate, not as similar names. With a key, `sold_before` also appears: this exact name sold before.

## The value

The stored value of a name and its last 20 estimates. It needs a key. `current` is `null` when no estimate is stored, and this call never starts one.

<!-- example: value fixture -->
```js
import { appraisal } from '@uniquedomains/domain-appraisal';

const { current } = await appraisal('get.plumbing', { apiKey: process.env.UD_API_KEY });
console.log(current.value, current.asOf);
```

Without a key, the call throws a `PlanRequiredError`:

<!-- example: refused -->
```js
import { appraisal, PlanRequiredError } from '@uniquedomains/domain-appraisal';

try {
    await appraisal('get.plumbing');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## A fresh appraisal

Runs the appraisal when a stored name's estimate is missing, and answers the value. It needs a key on the Investor plan, and spends one Appraisal unit when this call starts a run; a fresh estimate spends none. When another call holds the run, the API answers 202 with what is stored so far, so `current` may be `null`: ask again in about 30 seconds. The name must be stored already: [`check` in `@uniquedomains/domain-availability`](https://www.npmjs.com/package/@uniquedomains/domain-availability) stores it.

<!-- example: appraise fixture -->
```js
import { appraise } from '@uniquedomains/domain-appraisal';

const { current } = await appraise('get.plumbing', { apiKey: process.env.UD_API_KEY });
console.log(current ? current.value : 'Still running: ask again in about 30 seconds.');
```

## The command

```bash
ud-appraise get.plumbing
ud-appraise get.plumbing --value --key ud_live_...
ud-appraise get.plumbing --run --key ud_live_...
```

A table on a terminal, JSON in a pipe. `ud-appraise --help` lists the flags.

## Keys and limits

Without a key you read the comparable sales, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and a fresh appraisal needs the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Appraisal on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-appraisal3) serves all three: pass `{ rapidApi: { key, listing: 'appraisal' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Domain appraisal API page](https://unique.domains/api/appraisal) shows the answer and its fields, and you can run the free call there.

## License

MIT
