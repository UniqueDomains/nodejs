/*----------------------------------
- BIN: ud AND uniquedomains
----------------------------------*/

/** Both bins run this file (plan decision 17): `ud` as the brief names it, `uniquedomains` when another `ud` is installed. */

import { run } from './run';

// `ud openapi | head` closes the pipe early: that is the reader's choice, not a failure, so it ends quietly.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
});

const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
};

run(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    isTTY: Boolean(process.stdout.isTTY),
    columns: process.stdout.columns || 100,
    readStdin,
}).then(
    (code) => {
        process.exitCode = code;
    },
    (error: Error) => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    },
);
