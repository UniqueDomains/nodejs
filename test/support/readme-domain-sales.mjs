// What a README's `from 'domain-sales'` becomes: see readme-packages.mjs.
import * as source from '../../packages/domain-sales/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/domain-sales/dist/index.js';
export const { salesPulse, salesByEnding, salesByLength, salesMovers, salesSeries, salesOfWord } = wrapAll(source);
