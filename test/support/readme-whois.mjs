// What a README's `from '@uniquedomains/whois'` becomes: see readme-packages.mjs.
import * as source from '../../packages/whois/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/whois/dist/index.js';
export const { whois, dns, whoisHistory } = wrapAll(source);
