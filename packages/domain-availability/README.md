# Domain availability check for Node.js

Is the name free, and what will it cost to keep? One call answers both, with no key: the name's status, its drop day, its price today and its renewal price, from a record of 37 million names read every day. A live registry check needs a key, and a list of names at once needs a key on the Investor plan. To try a name with no code, use [unique.domains/availability](https://unique.domains/availability).

```bash
npx @uniquedomains/domain-availability get.plumbing
```

```bash
npm install @uniquedomains/domain-availability
```

Node 20 or later. ESM and CommonJS. Built on [`@uniquedomains/sdk`](https://www.npmjs.com/package/@uniquedomains/sdk).

## The stored answer

<!-- example: availability -->
```js
import { availability } from '@uniquedomains/domain-availability';

const answer = await availability('get.plumbing');
console.log(answer.status, answer.ownableNow, answer.price.firstYear);
```

`status` says where the name stands, `ownableNow` whether it can be bought now, `drop` the day it is due to come free when one is known, and `price` what it costs for the first year and to renew. The answer comes from storage, not from the registry at that moment. A name the catalog never stored answers `tracked: false` and the status `not_checked`, which says nothing about whether it is free: that is when the live check helps.

## The live check

Reads the name from its registry and a registrar now, stores the answer and returns it. It needs a key. Live checks are counted apart from your calls, in Live units your plan or RapidAPI subscription includes each month: this spends one when the live read runs, also when the registry was asked and did not conclude.

<!-- example: check fixture -->
```js
import { check } from '@uniquedomains/domain-availability';

const answer = await check('zorbly.io', { apiKey: process.env.UD_API_KEY });
console.log(answer.status, answer.checked);
```

`checked` is `false` when the answer came from storage and no unit was spent. When the registry did not conclude, the API answers 202 with what is stored so far, and `.withMeta()` carries that `status`. Without a key, the call throws a `PlanRequiredError`:

<!-- example: refused -->
```js
import { check, PlanRequiredError } from '@uniquedomains/domain-availability';

try {
    await check('zorbly.io');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## Many names at once

Up to 100 names, with their stored answers in the order you sent them. It needs a key on the Investor plan, makes no live read, and is billed one call per name sent, the refused ones included.

<!-- example: batch fixture -->
```js
import { availabilityBatch } from '@uniquedomains/domain-availability';

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

Without a key you read the stored answer, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and many names at once need the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Availability on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-availability14) serves all three: pass `{ rapidApi: { key, listing: 'availability' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Domain availability API page](https://unique.domains/api/availability) shows the answer and its fields, and you can run the call there.

## License

MIT
