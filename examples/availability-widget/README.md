# Domain availability widget

One script tag that draws a domain name's stored status on any page, with no library, no build and no key.

```html
<script src="widget.js" data-name="get.plumbing" async></script>
```

Copy [`widget.js`](widget.js) to your site, or open [`index.html`](index.html) to see it. The widget puts a `<span class="ud-availability">` right after its script tag, so your page's CSS styles it.

## Limits

The call leaves from each visitor's browser, so it spends that visitor's own free calls: 60 an hour and 100 a UTC day from one address. It runs once per page view, and past the limit the widget shows the API's refusal.

The status is the stored one, not a live read of the registry. A key does not belong here: a page a visitor loads shows it to everyone. For a key, read the API from a server, as in the [Next.js example](../nextjs-domain-search).
