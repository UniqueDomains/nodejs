# Domain sales for Node.js

What do domain names sell for? `await salesPulse()` answers 41,098 sales over 12 months at a median of $839, and 2,471 over the last 30 days at $1,580. `salesByEnding()` splits them: `.com` 28,739 sales at a median of $860, `.ai` 3,466 at $800, `.io` 1,032 at $400. `salesOfWord('harbor')` gives one word's count, its median, the endings it sold on and the month of its last sale. `salesByLength()`, `salesMovers()` and `salesSeries()` give the same market by name length, by the words whose sales moved and day by day. Counts and medians, never a single sale. `salesPulse()` answers with no key. The newest sales are a page: [unique.domains/sales](https://unique.domains/sales).

```bash
npx domain-sales .com
```

```bash
npm install domain-sales
```

Node 20 or later. ESM and CommonJS.

One family on the [Unique.domains API](https://unique.domains/api): [`domain-name-api`](https://www.npmjs.com/package/domain-name-api) (every operation, typed), [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli) (the same from a terminal), [`domain-availability`](https://www.npmjs.com/package/domain-availability), [`domain-appraisal`](https://www.npmjs.com/package/domain-appraisal), [`registrar-prices`](https://www.npmjs.com/package/registrar-prices), [`@uniquedomains/whois`](https://www.npmjs.com/package/@uniquedomains/whois), [`expired-domains-api`](https://www.npmjs.com/package/expired-domains-api) and [`domain-auctions`](https://www.npmjs.com/package/domain-auctions).

## The whole market

The sales of the last 7 days, 30 days and 12 months, each with its count and its median price in US dollars:

<!-- example: pulse -->
```js
import { salesPulse } from 'domain-sales';

const { pulse } = await salesPulse();
for (const window of pulse.windows) console.log(window.id, window.count, window.medianUsd);
```

The answer also carries the same figures for the period before each window, the sales by price band over 30 days and 12 months, and how many names sold more than once.

## By ending

Every ending with three sales or more in 12 months, in alphabetical order:

<!-- example: endings -->
```js
import { salesByEnding } from 'domain-sales';

const endings = await salesByEnding();
const com = endings.find((row) => row.ending === 'com');
console.log(com.count12m, com.median12mUsd, com.count30d, com.median30dUsd);
```

Each row also carries the 12 months before and a trend word, `up`, `down`, `flat` or `new`.

## By name length, the movers and the series

`salesByLength()` gives the sales by name length on .com, .ai, .io and .co, each length with its count and median price over 12 months and 30 days. `salesMovers()` gives up to ten words whose sales moved over the last 30 days, each with its direction and its count. `salesSeries({ kind: 'month' })` gives the sales of each day, week or month, oldest first, with the count, the mean and the median. They read as `salesByEnding()` does.

## One word

One word's sales over 12 months: how many, the median price, how many endings it sold on and the month of its last sale.

<!-- example: word -->
```js
import { salesOfWord } from 'domain-sales';

const word = await salesOfWord('harbor');
console.log(word.sales12m, word.median12mUsd, word.endingsSoldOn, word.lastSaleMonth);
```

Without a key, one address reads one word a day: the same word again is answered, and another throws a `RateLimitError` until the next UTC day. A key reads any number of words. A word with no sale in 12 months answers `status: 'none'`.

## The command

```bash
ud-sales
ud-sales .com
ud-sales harbor
ud-sales --lengths
ud-sales --movers
ud-sales --series month
```

With no argument, the whole market; an argument with a dot, that ending; any other, that word. A table on a terminal, JSON in a pipe. `ud-sales --help` lists the flags.

## Keys and limits

Without a key you read the free calls, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Sales History on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-sales-history1) serves the market, the series and the word: pass `{ rapidApi: { key, listing: 'sales-history' } }`. The endings, the lengths and the movers are on [Domain Market](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-market), with `listing: 'market'`. RapidAPI's free Basic plan reads the free calls only.

The [Domain sales history API page](https://unique.domains/api/sales-history) shows the answer and its fields, and you can run the call there.

## License

MIT
