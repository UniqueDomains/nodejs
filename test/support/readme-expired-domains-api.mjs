// What a README's `from 'expired-domains-api'` becomes: see readme-packages.mjs.
import * as source from '../../packages/expired-domains-api/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/expired-domains-api/dist/index.js';
export const { drops, expiring } = wrapAll(source);
