/*----------------------------------
- NAMESPACED METHODS
----------------------------------*/

/**
 * Binds the generated table (`generated/namespaces.ts`, plan decision 13) to a client's `requestOperation`, so
 * `ud.names.get('harbor.io')` is the same call as `request('get_name', { path: { name: 'harbor.io' } })`.
 */

import { createCall } from './call';
import { NAMESPACE_METHODS, type NamespacedClient } from './generated/namespaces';
import type { OperationId } from './generated/operations';
import type { OperationAnswer, OperationRequestParams } from './types';

export const bindNamespaces = (requestOperation: (operationId: OperationId, params?: OperationRequestParams) => Promise<OperationAnswer>): NamespacedClient => {
    const bind = (methods: Readonly<Record<string, OperationId>>) => Object.fromEntries(
        Object.entries(methods).map(([method, operationId]) => [method, (...args: unknown[]) => createCall(operationId, args, requestOperation)]),
    );
    // The generated type holds each method's own signature; the runtime is one function for all of them.
    return Object.fromEntries(Object.entries(NAMESPACE_METHODS).map(([namespace, methods]) => [namespace, bind(methods)])) as NamespacedClient;
};
