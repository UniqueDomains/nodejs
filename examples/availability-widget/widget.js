// @ts-check
/**
 * Draws a domain name's stored status on any page, with one script tag and no library:
 *
 *   <script src="widget.js" data-name="get.plumbing" async></script>
 *
 * The call leaves from the visitor's browser, so it spends that visitor's own free calls and needs no key. Never add a
 * key here: a page a visitor loads shows it to everyone.
 */
(() => {
    const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
    const name = script?.dataset.name?.trim();
    if (!script || !name) return;

    const output = document.createElement('span');
    output.className = 'ud-availability';
    output.textContent = `${name}: checking`;
    script.after(output);

    /** @param {{ tracked?: boolean, status?: string, ownableNow?: boolean }} data */
    const describe = (data) => {
        if (!data.tracked) return 'not in the catalog yet';
        if (data.status === 'free' || data.status === 'free_premium') return 'free to register';
        if (data.ownableNow) return 'can be bought now';
        return String(data.status).replace(/_/g, ' ');
    };

    fetch(`https://api.unique.domains/v1/names/${encodeURIComponent(name)}?fields=tracked,status,ownableNow`, { headers: { Accept: 'application/json' } })
        .then(async (response) => {
            const body = await response.json();
            // The API's own words on a refusal: the visitor's free calls may be spent.
            output.textContent = `${name}: ${response.ok ? describe(body.data) : body.detail}`;
        })
        .catch(() => {
            output.textContent = `${name}: the API did not answer`;
        });
})();
