/*----------------------------------
- TEXT RULES: WHAT NO TEXT A READER SEES MAY SAY
----------------------------------*/

/**
 * Gaetan's rules of 2026-11-12 and 2026-11-13: no text says where the data comes from or that an answer is stored or
 * live, none says when our data was read, and none says something was made by AI. The patterns hold the plan's M6 and
 * "The round of the three rules" (plan "never where data comes from"), lane W's AI patterns, and wider forms found by
 * this lane's reviews: dated examples, "fresh", "out of date", "latest record", the registry as the origin, "live
 * from". "live check" is the paid operation's name and passes; so do "read every day", "price today" and a window such
 * as "the last 90 days".
 *
 * One entry per alternative. The test holds a sample for each id that this entry alone catches, so it fails when any
 * entry goes or breaks. Every pattern is case-insensitive except `ai-made`, so ".ai estimate" passes.
 */

const SOURCE = '"stored", a scan or which answers are live (say what the reader gets, "in the catalog", or "a live check")';
const REGISTRY = 'the registry named as where the answer comes from';
const AGE = 'when our data was read';
const AI = 'a text or figure said to be made by AI';

/** Phrases banned in a text a reader sees. One entry per line, so a test can delete each in turn. */
export const READER_RULES = [
    { id: 'stored', pattern: /\bstor(?:e|es|ed|ing|age)\b/i, label: SOURCE },
    { id: 'scan', pattern: /\b(?:re)?scann?(?:s|er|ers|ed|ing)?\b/i, label: SOURCE },
    { id: 'sync', pattern: /\bsync\w*/i, label: SOURCE },
    { id: 'not-live', pattern: /\bnot (?:a )?live\b/i, label: SOURCE },
    { id: 'never-live', pattern: /\bnever live\b/i, label: SOURCE },
    { id: 'live-read', pattern: /\blive (?:read|reads|reading|readings|lookup|lookups)\b/i, label: SOURCE },
    { id: 'reads-live', pattern: /\breads? (?:\w+ ){0,3}live\b/i, label: SOURCE },
    { id: 'live-from', pattern: /\blive from\b/i, label: SOURCE },
    { id: 'live-registry-check', pattern: /\blive registry check\b/i, label: REGISTRY },
    { id: 'from-registry', pattern: /\bfrom (?:its|the) registry\b/i, label: REGISTRY },
    { id: 'registry-word', pattern: /\bregistry['\u2019]?s word\b/i, label: REGISTRY },
    { id: 'to-registry', pattern: /\b(?:sent to|asked) the registry\b/i, label: REGISTRY },
    { id: 'registry-asked', pattern: /\bthe registry (?:was asked|did not conclude)\b/i, label: REGISTRY },
    { id: 'as-of', pattern: /\bas of\b/i, label: AGE },
    { id: 'carries-its-day', pattern: /\bcarries its day\b/i, label: AGE },
    { id: 'day-it-is-from', pattern: /\bthe day it is from\b/i, label: AGE },
    { id: 'latest-day', pattern: /\blatest (?:footprint )?day\b/i, label: AGE },
    { id: 'latest-record', pattern: /\blatest (?:registry |DNS )?(?:records?|readings?|answers?|status)\b/i, label: AGE },
    { id: 'how-current', pattern: /\bhow (?:current|fresh)\b/i, label: AGE },
    { id: 'checked-on', pattern: /\bchecked (?:on|just now)\b/i, label: AGE },
    { id: 'checked-date', pattern: /\bchecked \d/i, label: AGE },
    { id: 'out-of-date', pattern: /\bout of date\b/i, label: AGE },
    { id: 'its-dates', pattern: /\beach with its dates\b/i, label: AGE },
    // One exception, Gaetan's D15 of 2026-11-24 ("Narrow the check"): the day a name comes free or drops is a fact of
    // the name, not the day our data was read, as in expired-domains-api's approved description, "with the day each one
    // comes free". Only that: "with its day" and any other "with the day" stay refused.
    { id: 'with-its-day', pattern: /\bwith (?:its day\b|the day\b(?! (?:each one|each name|the name|it) (?:comes free|drops)\b))/i, label: AGE },
    { id: 'dated-by-day', pattern: /\bdated by day\b/i, label: AGE },
    { id: 'fresh', pattern: /\bfresh (?:estimates?|appraisals?|reads?|readings?|records?|answers?|data|status(?:es)?|figures?)\b/i, label: AGE },
    { id: 'dated-example', pattern: /\(\d{4}-\d{2}-\d{2}[,)]/, label: 'a dated example answer (the day goes, 26A)' },
    { id: 'answered-on', pattern: /\banswered on \d/i, label: 'a dated example answer (the day goes, 26A)' },
    { id: 'body-publishes', pattern: /\bas (?:ICANN|IANA) (?:publishes|names)\b/i, label: 'a public body named as where the data comes from' },
    { id: 'ai-made', pattern: /\bAI[ -](?:editor|estimate|appraisal|valuation|written|generated|summary|model)\b/, label: AI },
    { id: 'made-by-ai', pattern: /\b(?:written|generated|made|drafted|created) by (?:an? )?(?:AI|Claude|model|LLM)\b/i, label: AI },
    { id: 'claude-models', pattern: /\bClaude models?\b/i, label: AI },
];

/** Paths whose text no reader sees: the tests and the scripts, whose names and fixtures may carry the words. */
const NOT_READER = [/(^|\/)test\//, /(^|\/)typetests\//, /^scripts\//];
/** Scripts that write reader text: the SDK's method docstrings, and a placeholder package's description and README. */
const READER_SCRIPTS = new Set(['scripts/lib/codegen.mjs', 'scripts/lib/packages.mjs']);

/** Whether a repository-relative path holds text a reader sees (a README, a manifest, a help line, a docstring). */
export const isReaderFile = (relativePath) => {
    const path = relativePath.split('\\').join('/');
    return READER_SCRIPTS.has(path) || !NOT_READER.some((pattern) => pattern.test(path));
};

/** The ids of the rules a text breaks. */
export const brokenRules = (text, rules = READER_RULES) => rules.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);

/** The labels of the rules a text breaks, each once. */
export const brokenBy = (text) => [...new Set(READER_RULES.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label))];

/** A file's lines joined into one text, comment and quote markers dropped, so a phrase a line wrap splits is caught too. */
export const joinedText = (lines) => lines.map((line) => line.replace(/\r$/, '').replace(/^\s*(?:\*|\/\/|\/\*\*?|#+|>+)?\s*/, '')).join(' ');
