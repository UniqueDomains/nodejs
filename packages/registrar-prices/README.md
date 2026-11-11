# Registrar price comparison for Node.js

The first-year price is not the price you keep paying: `.agency` costs $3.50 for the first year at Dynadot and $28.04 a year after that (2026-11-11). This package reads what nine registrars charge for an ending, the endings whose renewal is a trap (over 300 today) and each price change, served only once the new price read the same on the next morning. All of that is free and needs no key. The cheapest registrar across many endings needs a key, and an ending's price history needs a key on the Investor plan.

```bash
npx @uniquedomains/registrar-prices io
```

```bash
npm install @uniquedomains/registrar-prices
```

Node 20 or later. ESM and CommonJS. Built on [`@uniquedomains/sdk`](https://www.npmjs.com/package/@uniquedomains/sdk).

## Every registrar's price for an ending

<!-- example: prices -->
```js
import { pricesForTld } from '@uniquedomains/registrar-prices';

const prices = await pricesForTld('io');
for (const row of prices) console.log(row.name, row.purchasePrice, row.renewalPrice);
```

`.io` and `io` read the same ending. Each row also carries the transfer price, the currency, and the marks `cheapest`, `cheapestRenewal`, `cheapestTransfer`, `isPromo` and `renewalTrap`. The free tier answers every ending of the public set, the short list that `GET /tlds?publicSet=true` gives; outside it, one ending a UTC day.

## Renewal traps

A trap is an ending whose cheapest first year renews at a much higher price. Free, you read eight rows, and the whole count is in the answer's `meta`:

<!-- example: traps -->
```js
import { renewalTraps } from '@uniquedomains/registrar-prices';

const { data, meta } = await renewalTraps().withMeta();
console.log(meta.trapCount, data[0].tld, data[0].multiple);
```

## Price changes

Confirmed changes across the registrars, newest first. Free, you read the ten newest.

<!-- example: changes -->
```js
import { priceChanges } from '@uniquedomains/registrar-prices';

const changes = await priceChanges();
for (const change of changes) console.log(change.extension, change.registrarName, change.oldPrice, change.newPrice);
```

With a key, `priceChanges` and `renewalTraps` read every row, and a `for await` loop walks the pages. `priceChanges` also takes the filters `ending`, `registrar`, `field` and `since`.

## With a key

The cheapest registrar for each of up to 100 endings:

<!-- example: cheapest fixture -->
```js
import { cheapest } from '@uniquedomains/registrar-prices';

const rows = await cheapest(['ai', 'io'], { apiKey: process.env.UD_API_KEY });
for (const row of rows) console.log(row.ending, row.cheapestYear1?.registrar ?? 'no price', row.cheapestYear1?.price ?? '');
```

How an ending's prices changed, newest first, on the Investor plan. A loop walks the pages:

<!-- example: history fixture -->
```js
import { priceHistory } from '@uniquedomains/registrar-prices';

for await (const row of priceHistory('io', { apiKey: process.env.UD_API_KEY, maxRows: 50 })) {
    console.log(row.registrar, row.purchasePrice, row.firstSeenAt);
}
```

Without a key, both throw a `PlanRequiredError`:

<!-- example: refused -->
```js
import { cheapest, PlanRequiredError } from '@uniquedomains/registrar-prices';

try {
    await cheapest(['ai', 'io']);
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## The command

```bash
ud-prices io
ud-prices --traps
ud-prices --changes
ud-prices --cheapest ai,io --key ud_live_...
ud-prices io --history --key ud_live_...
```

A table on a terminal, JSON in a pipe. `ud-prices --help` lists the flags.

## Keys and limits

Without a key you read the free calls, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and the price history needs the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Price Comparison on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-price-comparison) serves everything here but the history: pass `{ rapidApi: { key, listing: 'price-comparison' } }`. The history is on [Registrar Prices](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/registrar-prices), with `listing: 'registrars'`. RapidAPI's free Basic plan reads the free calls only.

The [Domain price comparison API page](https://unique.domains/api/price-comparison) shows the answer and its fields, and you can run the call there.

## License

MIT
