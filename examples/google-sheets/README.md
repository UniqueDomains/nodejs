# Domain names in Google Sheets

A custom function for Google Sheets, written in Apps Script with no library and no key.

```
=UD_NAME("get.plumbing")
=UD_NAME("get.plumbing", "price.firstYear")
=UD_NAME("get.plumbing", "registry.expiresAt")
```

## Install it

1. In your sheet, open Extensions, then Apps Script.
2. Paste [`Code.gs`](Code.gs) and save.
3. Type the formula in a cell. Google asks once for the permission to reach an outside address.

The field is any path in the answer of [`GET /names/{name}`](https://unique.domains/api/get-name). A name the catalog never stored answers `not_checked` as its status.

## Limits

The free tier answers 60 calls an hour and 100 a UTC day from one address. Apps Script calls from Google's addresses, which other scripts share, so a large sheet can meet the limit sooner: the cell then shows the API's refusal. The script caches each name for six hours to spend fewer calls.

A key does not belong here: anyone who can open the script can read it. For more calls, read the API from a server, as in the [Next.js example](../nextjs-domain-search).
