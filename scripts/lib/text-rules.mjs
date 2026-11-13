/*----------------------------------
- TEXT RULES: WHAT NO TEXT A READER SEES MAY SAY
----------------------------------*/

/**
 * Gaetan's rules of 2026-11-12 and 2026-11-13: no text says where the data comes from or that an answer is stored or
 * live, none says when our data was read, and none says something was made by AI. The patterns hold the plan's M6 and
 * "The round of the three rules" (plan "never where data comes from"), lane W's AI patterns, and wider forms found by
 * this lane's review: dated examples, "fresh", "out of date", the registry as the origin, "live from". "live check" is
 * the paid operation's name and passes; so do "read every day", "price today" and a window such as "the last 90 days".
 */

/** Phrases banned in a text a reader sees. Case-insensitive except the AI pattern, so ".ai estimate" passes. */
export const READER_RULES = [
    { pattern: /\bstor(?:e|es|ed|ing|age)\b/i, label: '"stored" (say what the reader gets, or "in the catalog")' },
    { pattern: /\b(?:re)?scann?(?:s|er|ers|ed|ing)?\b/i, label: 'a scan or the scanner (how the data is gathered)' },
    { pattern: /\bsync\w*/i, label: 'a sync (how the data is gathered)' },
    {
        pattern: /\bnot (?:a )?live\b|\bnever live\b|\blive (?:read|reads|reading|readings|lookup|lookups)\b|\breads? (?:\w+ ){0,3}live\b|\blive from\b/i,
        label: 'which answers are live (say "a live check" for the operation)',
    },
    { pattern: /\blive registry check\b|\bfrom (?:its|the) registry\b|\bregistry'?s word\b/i, label: 'the registry named as where the answer comes from' },
    { pattern: /\bas of\b|\bcarries its day\b|\bthe day it is from\b|\bon the latest day\b|\blatest (?:footprint )?day\b/i, label: 'when our data was read' },
    { pattern: /\bhow (?:current|fresh)\b|\bchecked (?:on|just now)\b|\bout of date\b/i, label: 'when our data was read' },
    { pattern: /\beach with its dates\b|\bwith (?:its|the) day\b|\bdated by day\b|\beach answer with its day\b/i, label: 'when our data was read' },
    { pattern: /\bfresh (?:estimate|appraisal|read|reading|record|answer|data|status|figures?)\b/i, label: 'when our data was read ("fresh")' },
    { pattern: /\(\d{4}-\d{2}-\d{2}[,)]|\banswered on \d/i, label: 'a dated example answer (the day goes, 26A)' },
    { pattern: /\bas (?:ICANN|IANA) (?:publishes|names)\b/i, label: 'a public body named as where the data comes from' },
    { pattern: /\bAI[ -](?:editor|estimate|appraisal|valuation|written|generated|summary|model)\b/, label: 'a text or figure said to be made by AI' },
    { pattern: /\b(?:written|generated|made|drafted|created) by (?:an? )?(?:AI|Claude|model|LLM)\b|\bClaude models?\b/i, label: 'a text or figure said to be made by AI' },
];

/** Paths whose text no reader sees: the tests and the scripts, whose names and fixtures may carry the words. */
const NOT_READER = [/(^|\/)test\//, /(^|\/)typetests\//, /^scripts\//];
/** Scripts that write reader text: the SDK's method docstrings come from this file's strings. */
const READER_SCRIPTS = new Set(['scripts/lib/codegen.mjs']);

/** Whether a repository-relative path holds text a reader sees (a README, a manifest, a help line, a docstring). */
export const isReaderFile = (relativePath) => {
    const path = relativePath.split('\\').join('/');
    return READER_SCRIPTS.has(path) || !NOT_READER.some((pattern) => pattern.test(path));
};

/** The labels of the rules a text breaks. */
export const brokenBy = (text) => [...new Set(READER_RULES.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label))];

/** A file's lines joined into one text, comment markers dropped, so a phrase a line wrap splits is caught too. */
export const joinedText = (lines) => lines.map((line) => line.replace(/^\s*(?:\*|\/\/|\/\*\*?|#)?\s*/, '')).join(' ');
