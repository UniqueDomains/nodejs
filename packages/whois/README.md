# WHOIS lookup for Node.js, with history

WHOIS has no single format: every registry answers its own way, and many now answer over RDAP only. This package skips that work. One call returns a domain name's registry record already parsed: dates, registrar, status codes, nameservers, DNSSEC and holder, stored with the day it was read. The record and the name's DNS are free and need no key. The history of past records needs a key on the Investor plan. To see a record before you install anything, look one up at [unique.domains/whois](https://unique.domains/whois).

```bash
npx @uniquedomains/whois get.plumbing
```

```bash
npm install @uniquedomains/whois
```

Node 20 or later. ESM and CommonJS. Built on [`@uniquedomains/sdk`](https://www.npmjs.com/package/@uniquedomains/sdk).

## The registry record

<!-- example: whois -->
```js
import { whois } from '@uniquedomains/whois';

const record = await whois('get.plumbing');
console.log(record.registrar?.name ?? 'no registrar on file', record.expiresAt);
```

The answer is the latest record stored in the Unique Domains catalog, not a query sent to the registry at that moment. A name with no stored record answers `read: false` and empty facts, never an error.

## The name's DNS

<!-- example: dns -->
```js
import { dns } from '@uniquedomains/whois';

const reading = await dns('get.plumbing');
console.log(reading.ns, reading.hasWebsite);
```

## The history of past records

Every stored version of the record, the registrar moves between them, the transfers the records name and the lock removals of the last 90 days. This one needs a key on the Investor plan.

<!-- example: history fixture -->
```js
import { whoisHistory } from '@uniquedomains/whois';

const history = await whoisHistory('zorbly.io', { apiKey: process.env.UD_API_KEY });
for (const move of history.moves) console.log(move.at, move.from, move.to);
```

Without a key, or with a key on a plan that does not include it, the call throws a `PlanRequiredError`:

<!-- example: refused -->
```js
import { PlanRequiredError, whoisHistory } from '@uniquedomains/whois';

try {
    await whoisHistory('zorbly.io');
} catch (error) {
    if (error instanceof PlanRequiredError) console.log('Needs a key:', error.product);
    else throw error;
}
```

## The command

```bash
ud-whois get.plumbing
ud-whois get.plumbing --json
ud-whois zorbly.io --history --key ud_live_...
```

A table on a terminal, JSON in a pipe. The bin is `ud-whois`, so it never shadows your system's `whois`. `ud-whois --help` lists the flags.

## Keys and limits

Without a key you read the free calls, within a limit per hour and per day from one address. Every function also takes a key, and reads `UD_API_KEY` from the environment when you pass none. Keep a key on a server: a page a visitor loads shows it to everyone.

- **A member key.** The Founder and Investor plans include the API with a key of your own, and the history needs the Investor plan. See [the plans](https://unique.domains/pricing).
- **A paid RapidAPI plan.** [WHOIS Lookup on RapidAPI](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/whois-lookup24) serves the record and the history: pass `{ rapidApi: { key, listing: 'whois' } }`. `dns` is not part of that listing; it is on [Domain Check](https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/domain-check18). RapidAPI's free Basic plan reads the free calls only.

The [WHOIS API page](https://unique.domains/api/whois) shows the record and its fields, and you can run the call there.

## License

MIT
