# Expired domains API for Node.js

Which names come free this week? `await drops()` answers for one day: 19 names dropping, on 11 endings, `.site` ahead with 4. This package reads the names in their last days before they come free, each with its ending and the day it drops, and with `expiring()` the names at or past their expiry date, soonest first, with their drop day once it is set. A day runs from today to six days ahead, and an ending narrows both lists. `drops()` answers with no key. The same names are a page: [unique.domains/domains/expired](https://unique.domains/domains/expired).

```bash
npx expired-domains-api
```

```bash
npm install expired-domains-api
```

Node 20 or later. ESM and CommonJS.

One family on the [Unique.domains API](https://unique.domains/api): [`domain-name-api`](https://www.npmjs.com/package/domain-name-api) (every operation, typed), [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli) (the same from a terminal), [`domain-availability`](https://www.npmjs.com/package/domain-availability), [`domain-appraisal`](https://www.npmjs.com/package/domain-appraisal), [`registrar-prices`](https://www.npmjs.com/package/registrar-prices), [`@uniquedomains/whois`](https://www.npmjs.com/package/@uniquedomains/whois), [`domain-sales`](https://www.npmjs.com/package/domain-sales) and [`domain-auctions`](https://www.npmjs.com/package/domain-auctions).

## The names dropping on a day

How many names drop today, split by ending, with the ending and drop day of five of them:

<!-- example: drops -->
```js
import { drops } from 'expired-domains-api';

const day = await drops();
console.log(day.count, day.byEnding.length);
for (const row of day.byEnding) console.log(row.ending, row.count);
```

`drops({ day })` reads another day, written `YYYY-MM-DD`, from today (UTC) to six days ahead; a day outside them throws a `ValidationError`. Without a key, or with a key on the Founder plan, the answer is these counts for every ending, never a name, and a call that asks for an `ending` throws a `PlanRequiredError`: the names, and the endings that narrow them, are on the Investor plan.

With a key on the Investor plan, the same call answers the names themselves, by name, and `ending` narrows them (`'io'`, `'.io'` or a list). A loop walks the pages:

<!-- example: names fixture -->
```js
import { drops } from 'expired-domains-api';

for await (const row of drops({ ending: 'io', apiKey: process.env.UD_API_KEY })) {
    console.log(row.name, row.dropsOn);
}
```

## The names reaching their expiry date

The names at or past their expiry date, soonest first, each with its drop day once it is set. `ending` narrows them, `after` and `before` bound the expiry day. This one needs a key on the Investor plan:

<!-- example: expiring fixture -->
```js
import { expiring } from 'expired-domains-api';

for await (const row of expiring({ ending: 'io', apiKey: process.env.UD_API_KEY, maxRows: 50 })) {
    console.log(row.name, row.expiresOn, row.dropsOn ?? 'no drop day yet');
}
```

Without a key, or with a key on a plan that does not include it, the call throws a `PlanRequiredError`:

<!-- example: refused fixture -->
```js
import { expiring, PlanRequiredError } from 'expired-domains-api';

try {
    await expiring();
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## The command

```bash
ud-expired
ud-expired --ending io --key ud_live_...
ud-expired --expiring --ending io --key ud_live_...
```

With no argument, today's drops; `--day YYYY-MM-DD` reads another day of the week ahead. A table on a terminal, JSON in a pipe. `ud-expired --help` lists the flags.

## Keys and limits

Without a key you read the free calls, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and the names, of both calls, need the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Expired Domains on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/expired-domains5) serves both calls: pass `{ rapidApi: { key, listing: 'expired' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Expired domains API page](https://unique.domains/api/expired) shows the answer and its fields, and you can run the call there.

## License

MIT
