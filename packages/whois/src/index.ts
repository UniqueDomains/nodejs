/*----------------------------------
- @uniquedomains/whois
----------------------------------*/

/** A name's registry record, its DNS and its past records, over the SDK's namespaced methods. */

import type { CallOptions, OperationCall } from '@uniquedomains/sdk';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from '@uniquedomains/sdk';
export type { ConnectionOptions };

/**
 * The latest stored registry record of a name: dates, registrar, status codes, nameservers, DNSSEC and holder. Free. A
 * name with no stored record answers `read: false` and empty facts, never an error.
 *
 * @example
 * const record = await whois('get.plumbing');
 */
export const whois = (name: string, options?: ConnectionOptions & CallOptions<'get_name_registry'>): OperationCall<'get_name_registry'> => {
    const { ud, call } = connect(options);
    return ud.names.registry(name, call);
};

/**
 * The latest stored DNS reading of a name and its parking venue. Free.
 *
 * @example
 * const reading = await dns('get.plumbing');
 */
export const dns = (name: string, options?: ConnectionOptions & CallOptions<'get_name_dns'>): OperationCall<'get_name_dns'> => {
    const { ud, call } = connect(options);
    return ud.names.dns(name, call);
};

/**
 * The stored versions of a name's registry record and what moved between them. Needs a key on the Investor plan, or a
 * paid RapidAPI subscription.
 *
 * @example
 * const history = await whoisHistory('zorbly.io', { apiKey: process.env.UD_API_KEY });
 */
export const whoisHistory = (name: string, options?: ConnectionOptions & CallOptions<'get_name_registry_history'>): OperationCall<'get_name_registry_history'> => {
    const { ud, call } = connect(options);
    return ud.names.registryHistory(name, call);
};
