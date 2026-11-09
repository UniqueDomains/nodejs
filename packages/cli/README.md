# @uniquedomains/cli

The [Unique Domains API](https://unique.domains/api) from the command line: domain names, words, endings, registrar prices, the domain market, trends and the agenda.

```bash
npx @uniquedomains/cli get-name harbor.io
```

Or install it once, which gives the `ud` command (and `uniquedomains`, the same command, for machines where another `ud` is installed):

```bash
npm install -g @uniquedomains/cli
ud get-name harbor.io
```

Node 20 or later.

## Commands

Every operation of the API is a command, its operation id in kebab case: `get_name` is `ud get-name`, `list_tld_prices` is `ud list-tld-prices`. The [API reference](https://unique.domains/api) names each endpoint the same way.

- Path parameters are arguments, in the order of the path: `ud get-name harbor.io`, `ud list-tld-prices io`.
- Query parameters are flags in kebab case: `ud list-tlds --public-set --limit 20`. A yes or no flag also takes `--no-<flag>`.
- A POST body's fields are flags too (`ud batch-names --names lantern.io,harbor.io`), or the whole body with `--body '{"names":["lantern.io"]}'`, `--body @file.json` or `--body -` for stdin.

```bash
ud --help                 # every command, grouped by API
ud list-tlds --help       # one command's arguments and flags
```

Three shortcuts: `ud whoami` (your key's plan and month), `ud enums` (every enumerated value) and `ud openapi` (the document this version was built from).

## Output

On a terminal, an answer prints as a table, with the register and dataset links under it when the answer has them and the cursor of the next page. Piped or redirected, it prints the API's JSON envelope. `--json` asks for JSON on a terminal too, and `--csv` prints the CSV form on the commands that have one.

```bash
ud list-tlds --limit 3 --json
ud list-tld-prices io --csv > io-prices.csv
```

`--verbose` prints the request, the status and the quota and rate-limit headers on stderr. `--json=false` prints a table even when the output is piped.

Arguments and flags are checked before any call: a missing required flag, a number that is not one, or a value outside a command's list exits with code 2 and makes no call. A refused call exits with code 1 and prints the API's explanation on stderr.

## Keys

Without a key you read the free endpoints. A member key, included in the Founder and Investor plans, also reads the keyed endpoints its plan includes; the [API page](https://unique.domains/api) lists them:

```bash
export UD_API_KEY=ud_live_...
ud whoami
ud get-name-registry harbor.io --verbose
```

Create the key in the product under Settings, Account, API, and keep it on your machine or a server, never in a page a visitor loads. `--key` passes one for a single command.

A RapidAPI subscription works too, with the listing it subscribes to:

```bash
ud --rapidapi-key "$RAPIDAPI_KEY" --listing whois get-name-registry harbor.io
```

`UD_RAPIDAPI_KEY` and `UD_RAPIDAPI_LISTING` set them for every command. `UD_API_BASE` or `--base` points the command at another base URL. With a RapidAPI key, only `--base` does: `UD_API_BASE` is not read, so a base left set from member-key work never receives your RapidAPI key. Pass `--base` on purpose when you test against a local gateway.

## Also

- [`@uniquedomains/sdk`](https://www.npmjs.com/package/@uniquedomains/sdk): the typed client behind this command.
- `@uniquedomains/mcp-server`: the same API as tools for AI assistants, coming next in its own repository.
- [The datasets](https://github.com/UniqueDomains) on GitHub.

MIT
