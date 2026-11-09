# Domain search with Next.js

An App Router page that looks up a domain name on the server, with [`@uniquedomains/sdk`](../../packages/sdk). No key needed.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and look up a name.

## Limits

The free tier answers 60 calls an hour and 100 a UTC day from one address. Here that address is your server's, so all your visitors share those calls. Past them, the page shows the API's refusal.

For more, set `UD_API_KEY` on the server: the client reads it, and the key stays on the server because the page renders there. Never pass a key to a client component: a page a visitor loads shows it to everyone. The [plans](https://unique.domains/pricing) say what each key includes.
