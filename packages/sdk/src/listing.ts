/*----------------------------------
- LISTING TABLE: TYPES AND LOOKUPS
----------------------------------*/

/**
 * The sixteen RapidAPI listings (`generated/listings.ts`): a RapidAPI key works on the listing it subscribes to, at
 * that listing's own host, for that listing's operations only. A full listing serves one API's operations, a focused
 * listing a few operations of one or two APIs, and every listing the shared `/meta` and `/editions` paths.
 */

import { LISTINGS, type ListingId } from './generated/listings';

export type ListingDefinition = {
    readonly id: string;
    /** The listing's name on RapidAPI (`Domain Check`, `WHOIS Lookup`). */
    readonly title: string;
    /** RapidAPI's host for the listing, sent as `X-RapidAPI-Host` and used as the base URL. */
    readonly host: string;
    readonly operations: readonly string[];
};

export const findListing = (id: string): ListingDefinition | undefined => LISTINGS.find((listing) => listing.id === id);

export const isListingId = (id: string): id is ListingId => findListing(id) !== undefined;

export const listingServes = (listing: ListingDefinition, operationId: string): boolean => listing.operations.includes(operationId);

/** The listings whose key opens an operation: what a `ListingMismatchError` suggests. */
export const listingsServing = (operationId: string): readonly ListingDefinition[] => LISTINGS.filter((listing) => listingServes(listing, operationId));
