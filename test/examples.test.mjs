import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadRecorded } from './support/fixture-server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...path) => readFileSync(join(ROOT, ...path), 'utf8');
const free = loadRecorded().find((fixture) => fixture.name === 'usecase-availability');

describe('the starter templates (plan decision 19)', () => {
    const limit = free.response.headers['x-ratelimit-limit'];

    for (const example of ['nextjs-domain-search', 'google-sheets', 'availability-widget']) {
        it(`${example}'s README names the free limits, and says where a key goes`, () => {
            const readme = read('examples', example, 'README.md');
            assert.ok(readme.includes(`${limit} `), `the recorded answer says ${limit} an hour`);
            assert.match(readme, /60 (calls )?an hour and 100 a UTC day/);
            assert.match(readme, /key/i);
        });
    }

    it('the Next.js example pins the SDK at the lockstep version', () => {
        const { version } = JSON.parse(read('packages', 'sdk', 'package.json'));
        assert.equal(JSON.parse(read('examples', 'nextjs-domain-search', 'package.json')).dependencies['@uniquedomains/sdk'], version);
    });

    it('the Next.js page never runs on the client: no directive, and the client reads the key on the server', () => {
        const page = read('examples', 'nextjs-domain-search', 'app', 'page.tsx');
        assert.doesNotMatch(page, /['"]use client['"]/);
        assert.doesNotMatch(page, /NEXT_PUBLIC/);
    });
});

/** Runs Code.gs with Apps Script's two services stubbed. */
const loadSheets = (answer) => {
    const store = new Map();
    const calls = [];
    const context = vm.createContext({
        CacheService: { getScriptCache: () => ({ get: (key) => store.get(key) ?? null, put: (key, value) => store.set(key, value) }) },
        UrlFetchApp: { fetch: (url, options) => {
            calls.push({ url, options });
            return { getResponseCode: () => answer.status, getContentText: () => JSON.stringify(answer.body) };
        } },
        encodeURIComponent,
        JSON,
    });
    vm.runInContext(read('examples', 'google-sheets', 'Code.gs'), context);
    return { UD_NAME: context.UD_NAME, calls };
};

describe('=UD_NAME', () => {
    it('answers the status by default, a dotted field on request, an empty cell for none', () => {
        const { UD_NAME, calls } = loadSheets(free.response);
        assert.equal(UD_NAME('get.plumbing'), 'for_sale');
        assert.equal(UD_NAME('get.plumbing', 'price.kind'), 'aftermarket');
        assert.equal(UD_NAME('get.plumbing', 'price.firstYear'), '');
        assert.equal(UD_NAME('get.plumbing', 'no.such.field'), '');
        assert.equal(calls[0].url, 'https://api.unique.domains/v1/names/get.plumbing');
        assert.equal(calls[0].options.headers.Authorization, undefined);
    });

    it('spends one call per name, whatever the fields', () => {
        const { UD_NAME, calls } = loadSheets(free.response);
        UD_NAME('get.plumbing');
        UD_NAME(' GET.plumbing ', 'lifecycle');
        assert.equal(calls.length, 1);
    });

    it('shows the API\'s own refusal, and caches none', () => {
        const { UD_NAME, calls } = loadSheets({ status: 429, body: { detail: 'The keyless hourly window is spent.' } });
        assert.throws(() => UD_NAME('get.plumbing'), /keyless hourly window/);
        assert.throws(() => UD_NAME('get.plumbing'), /keyless hourly window/);
        assert.equal(calls.length, 2);
    });
});

/** Runs widget.js in a page stubbed down to what it touches. */
const loadWidget = async (dataset, respond) => {
    const output = {};
    const urls = [];
    const pending = [];
    const context = vm.createContext({
        document: {
            currentScript: { dataset, after: (element) => { output.element = element; } },
            createElement: () => ({ set textContent(value) { output.text = value; }, get textContent() { return output.text; } }),
        },
        fetch: (url, init) => {
            urls.push({ url, init });
            const answer = respond();
            pending.push(answer.catch(() => {}));
            return answer;
        },
        encodeURIComponent,
        String,
    });
    vm.runInContext(read('examples', 'availability-widget', 'widget.js'), context);
    await Promise.all(pending);
    await new Promise((resolve) => setImmediate(resolve));
    return { output, urls };
};

const jsonAnswer = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

describe('the availability widget', () => {
    it('draws a status, asks only for what it reads, and sends no key', async () => {
        const { output, urls } = await loadWidget({ name: 'get.plumbing' }, jsonAnswer(200, { data: { tracked: true, status: 'for_sale', ownableNow: false } }));
        assert.equal(output.text, 'get.plumbing: for sale');
        assert.equal(urls[0].url, 'https://api.unique.domains/v1/names/get.plumbing?fields=tracked,status,ownableNow');
        assert.deepEqual({ ...urls[0].init.headers }, { Accept: 'application/json' });
    });

    it('says a free name is free, a buyable one can be bought, and an untracked one says nothing about being free', async () => {
        const open = await loadWidget({ name: 'a.io' }, jsonAnswer(200, { data: { tracked: true, status: 'free', ownableNow: true } }));
        assert.equal(open.output.text, 'a.io: free to register');
        const buyable = await loadWidget({ name: 'c.io' }, jsonAnswer(200, { data: { tracked: true, status: 'parked', ownableNow: true } }));
        assert.equal(buyable.output.text, 'c.io: can be bought now');
        const unknown = await loadWidget({ name: 'b.io' }, jsonAnswer(200, { data: { tracked: false, status: 'not_checked', ownableNow: false } }));
        assert.equal(unknown.output.text, 'b.io: not in the catalog yet');
    });

    it('shows the API\'s refusal, and a line when the network fails', async () => {
        const refused = await loadWidget({ name: 'a.io' }, jsonAnswer(429, { detail: 'The keyless hourly window is spent.' }));
        assert.equal(refused.output.text, 'a.io: The keyless hourly window is spent.');
        const failed = await loadWidget({ name: 'a.io' }, async () => { throw new TypeError('Failed to fetch'); });
        assert.equal(failed.output.text, 'a.io: the API did not answer');
    });

    it('does nothing without a name', async () => {
        const { output, urls } = await loadWidget({}, jsonAnswer(200, {}));
        assert.equal(output.element, undefined);
        assert.equal(urls.length, 0);
    });

    it('writes text, never markup', () => {
        assert.doesNotMatch(read('examples', 'availability-widget', 'widget.js'), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    });
});

describe('context7.json (plan decision 20)', () => {
    const config = JSON.parse(read('context7.json'));

    it('names the project, the folders and what to leave out', () => {
        assert.equal(config.projectTitle, 'Unique Domains API (Node SDK)');
        assert.deepEqual(config.folders, ['packages', 'examples']);
        for (const folder of ['test', 'generated']) assert.ok(config.excludeFolders.includes(folder), folder);
    });

    it('its rules name the free tier and the server rule for keys', () => {
        const rules = config.rules.join(' ');
        assert.match(rules, /60 calls an hour and 100 a UTC day/);
        assert.match(rules, /key belongs on a server/);
    });
});

describe('the release workflow (plan lane N2)', () => {
    const release = read('.github', 'workflows', 'release.yml');

    it('publishes the list of workspaces, and uploads every package', () => {
        assert.match(release, /for package in \$\(node scripts\/list-packages\.mjs\); do/);
        assert.doesNotMatch(release, /for package in sdk cli/);
        assert.match(release, /packages\/\*\/dist/);
        assert.match(release, /packages\/\*\/LICENSE/);
        assert.match(release, /packages\/sdk\/openapi\.json/);
    });
});
