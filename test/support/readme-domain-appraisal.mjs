// What a README's `from '@uniquedomains/domain-appraisal'` becomes: see readme-packages.mjs.
import * as source from '../../packages/domain-appraisal/dist/index.js';
import { wrapAll } from './readme-packages.mjs';

export * from '../../packages/domain-appraisal/dist/index.js';
export const { comparableSales, appraisal, appraise } = wrapAll(source);
