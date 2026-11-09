// What a README's `from '@uniquedomains/registrar-prices'` becomes: see readme-packages.mjs.
import * as source from '../../packages/registrar-prices/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/registrar-prices/dist/index.js';
export const { pricesForTld, renewalTraps, priceChanges, cheapest, priceHistory } = wrapAll(source);
