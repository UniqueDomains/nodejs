/*----------------------------------
- ENDINGS, AS THE API READS THEM
----------------------------------*/

/** One ending (`io`, `.io`) or several, as a list or comma-separated. */
export type Endings = string | readonly string[];

/** `.IO`, `io` and ` io ` are one ending; the API reads a comma list without the dots, and answers 400 to a dot. */
export const endingsOf = (endings: Endings): string => {
    const entries = typeof endings === 'string' ? [endings] : endings;
    if (!Array.isArray(entries)) throw new TypeError('An ending is a string, or a list of them.');
    return [...new Set(entries.flatMap((entry, index) => {
        if (typeof entry !== 'string') throw new TypeError(`Entry ${index} is not an ending.`);
        return entry.split(',').map((ending) => ending.trim().replace(/^\.+/, '').toLowerCase()).filter(Boolean);
    }))].join(',');
};
