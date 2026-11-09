import { createClient, RateLimitError, ValidationError } from '@uniquedomains/sdk';

// This page renders on the server, so the call and any key stay there: UD_API_KEY, when set, never reaches the browser.
const ud = createClient();

type Lookup = { found: Awaited<ReturnType<typeof ud.names.get>> } | { problem: string };

const lookUp = async (name: string): Promise<Lookup> => {
    try {
        return { found: await ud.names.get(name) };
    } catch (error) {
        if (error instanceof ValidationError) return { problem: error.detail };
        if (error instanceof RateLimitError) return { problem: `The free limit is reached for now. Try again in ${error.retryAfter ?? 'a few'} seconds.` };
        throw error;
    }
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
    const name = (await searchParams).name?.trim();
    const lookup = name ? await lookUp(name) : null;

    return (
        <main>
            <h1>Domain search</h1>
            <form>
                <label>
                    Domain name{' '}
                    <input name="name" defaultValue={name} placeholder="get.plumbing" required />
                </label>{' '}
                <button type="submit">Look up</button>
            </form>
            {lookup && 'problem' in lookup && <p role="alert">{lookup.problem}</p>}
            {lookup && 'found' in lookup && (
                <dl>
                    <dt>Name</dt>
                    <dd>{lookup.found.name}</dd>
                    <dt>Status</dt>
                    <dd>{lookup.found.tracked ? lookup.found.status : 'Not in the catalog yet'}</dd>
                    <dt>First year</dt>
                    <dd>{lookup.found.price.firstYear === null ? 'No price stored' : `$${lookup.found.price.firstYear}`}</dd>
                    <dt>Renewal</dt>
                    <dd>{lookup.found.price.renewal === null ? 'No price stored' : `$${lookup.found.price.renewal}`}</dd>
                </dl>
            )}
        </main>
    );
}
