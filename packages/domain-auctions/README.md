# Domain auctions for Node.js

What closes today? `await auctions()` answers for the day: 407,548 names closing at seven venues, 1,401 of them with a bid, and the closings of the next seven days. `auctionSample()` gives up to 20 one-word names closing that day, each with its venue, its deadline and its bid. `auctionOf('get.plumbing')` gives the open auction of one name, if it has one. `auctionVenues()` gives each venue's rules: how an auction closes, when to pay, who may bid. `auctionOutcomes()` gives how confirmed auctions ended, by venue and day. `auctions()` answers with no key. The day's auctions are a page: [unique.domains/auctions](https://unique.domains/auctions).

```bash
npx domain-auctions
```

```bash
npm install domain-auctions
```

Node 20 or later. ESM and CommonJS.

One family on the [Unique.domains API](https://unique.domains/api): [`domain-name-api`](https://www.npmjs.com/package/domain-name-api) (every operation, typed), [`@uniquedomains/cli`](https://www.npmjs.com/package/@uniquedomains/cli) (the same from a terminal), [`domain-availability`](https://www.npmjs.com/package/domain-availability), [`domain-appraisal`](https://www.npmjs.com/package/domain-appraisal), [`registrar-prices`](https://www.npmjs.com/package/registrar-prices), [`@uniquedomains/whois`](https://www.npmjs.com/package/@uniquedomains/whois), [`expired-domains-api`](https://www.npmjs.com/package/expired-domains-api) and [`domain-sales`](https://www.npmjs.com/package/domain-sales).

## The day

How many names close today and how many have a bid, by venue, by ending and by name length, and the closings of the next seven days:

<!-- example: day -->
```js
import { auctions } from 'domain-auctions';

const day = await auctions();
console.log(day.closing, day.withBid);
for (const next of day.next7Days) console.log(next.day, next.closing);
```

Each venue's line also carries its median bid in US dollars, when it has one.

## The day's sample

Up to 20 one-word names closing that day, by deadline, each with its venue, its deadline and its bid. Drawn once a day, the same for every caller:

<!-- example: sample fixture -->
```js
import { auctionSample } from 'domain-auctions';

const names = await auctionSample();
for (const row of names) console.log(row.name, row.endsAt, row.bid ?? 'no bid yet');
```

## One name's auction

The open auction of one name: its venue, its deadline, its bid and bid count, and its first-year cost when the venue's rule is known. `null` when the name has no open auction.

<!-- example: one-name fixture -->
```js
import { auctionOf } from 'domain-auctions';

const auction = await auctionOf('get.plumbing');
console.log(auction ? `${auction.bid} ${auction.currency} until ${auction.endsAt}` : 'No open auction');
```

## The venues' rules

`auctionVenues()` gives the seven venues, each with its rules (how an auction closes, when to pay, who may bid), the kinds of auction it runs, its currency and the day's counts.

## How past auctions ended

Per venue, day and currency, how many confirmed auctions ended and their median amount, newest day first. `venue` keeps one venue, and a loop walks the pages. This one needs a key on the Investor plan:

<!-- example: outcomes fixture -->
```js
import { auctionOutcomes } from 'domain-auctions';

for await (const row of auctionOutcomes({ apiKey: process.env.UD_API_KEY, maxRows: 50 })) {
    console.log(row.day, row.venueLabel, row.count, row.median);
}
```

Without a key, or with a key on a plan that does not include it, the call throws a `PlanRequiredError`:

<!-- example: refused fixture -->
```js
import { auctionOutcomes, PlanRequiredError } from 'domain-auctions';

try {
    await auctionOutcomes();
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## The command

```bash
ud-auctions
ud-auctions get.plumbing
ud-auctions --sample
ud-auctions --venues
ud-auctions --outcomes --key ud_live_...
```

With no argument, the day; a name, its auction. A table on a terminal, JSON in a pipe. `ud-auctions --help` lists the flags.

## Keys and limits

Without a key you read the free calls, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and the outcomes need the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [Domain Auctions on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-auctions) serves every call here: pass `{ rapidApi: { key, listing: 'auctions' } }`. RapidAPI's free Basic plan reads the free calls only.

The [Domain auctions API page](https://unique.domains/api/auctions) shows the answer and its fields, and you can run the call there.

## License

MIT
