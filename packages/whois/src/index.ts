/*----------------------------------
- @uniquedomains/whois
----------------------------------*/

/** A name's registry record, its DNS and its past records, over the SDK's namespaced methods. */

import type { CallOptions, OperationCall } from '@uniquedomains/sdk';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from '@uniquedomains/sdk';
export type { ConnectionOptions };

/**
 * The registry record of a name: dates, registrar, status codes, nameservers, DNSSEC and holder. Free. The answer is
 * the record in the Unique.domains catalog. A name with no record in the catalog answers `read: false` and empty facts,
 * never an error; such a name may well be taken.
 *
 * @example
 * const record = await whois('get.plumbing');
 */
export const whois = (name: string, options?: ConnectionOptions & CallOptions<'get_name_registry'>): OperationCall<'get_name_registry'> => {
    const { ud, call } = connect(options);
    return ud.names.registry(name, call);
};

/**
 * The DNS records of a name and its parking venue. Free.
 *
 * @example
 * const reading = await dns('get.plumbing');
 */
export const dns = (name: string, options?: ConnectionOptions & CallOptions<'get_name_dns'>): OperationCall<'get_name_dns'> => {
    const { ud, call } = connect(options);
    return ud.names.dns(name, call);
};

/**
 * Every version of a name's registry record in the catalog, and what moved between them. Needs a key on the Investor plan, or a
 * paid RapidAPI subscription.
 *
 * @example
 * const history = await whoisHistory('zorbly.io', { apiKey: process.env.UD_API_KEY });
 */
export const whoisHistory = (name: string, options?: ConnectionOptions & CallOptions<'get_name_registry_history'>): OperationCall<'get_name_registry_history'> => {
    const { ud, call } = connect(options);
    return ud.names.registryHistory(name, call);
};
