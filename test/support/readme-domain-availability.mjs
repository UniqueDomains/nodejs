// What a README's `from '@uniquedomains/domain-availability'` becomes: see readme-packages.mjs.
import * as source from '../../packages/domain-availability/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/domain-availability/dist/index.js';
export const { availability, check, availabilityBatch } = wrapAll(source);
