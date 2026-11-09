import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { READ_PAUSE_MS, readInTurn } from '../lib/pace.mjs';

describe('readInTurn', () => {
    it('reads in order, pausing between two reads and not after the last', async () => {
        const events = [];
        const results = await readInTurn(['a', 'b', 'c'], async (item) => {
            events.push(item);
            return item.toUpperCase();
        }, { sleep: async (ms) => events.push(ms) });
        assert.deepEqual(results, ['A', 'B', 'C']);
        assert.deepEqual(events, ['a', READ_PAUSE_MS, 'b', READ_PAUSE_MS, 'c']);
    });

    it('keeps seventeen reads under the edge rule of 10 reads in 10 seconds', () => {
        assert.ok(READ_PAUSE_MS * 10 > 10_000, 'the eleventh read starts after the first has left the 10 seconds');
    });

    it('stops at a read that fails', async () => {
        const seen = [];
        await assert.rejects(readInTurn(['a', 'b'], async (item) => {
            seen.push(item);
            throw new Error('refused');
        }, { sleep: async () => {} }), /refused/);
        assert.deepEqual(seen, ['a']);
    });
});
