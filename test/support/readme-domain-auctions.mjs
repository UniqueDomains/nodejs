// What a README's `from 'domain-auctions'` becomes: see readme-packages.mjs.
import * as source from '../../packages/domain-auctions/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/domain-auctions/dist/index.js';
export const { auctions, auctionSample, auctionVenues, auctionOf, auctionOutcomes } = wrapAll(source);
