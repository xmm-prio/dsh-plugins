/**
 * The browser half's wire boundary.
 *
 * `connection.rpc.call` owns the envelope; this module owns everything else
 * about the wire, so no component ever sees an endpoint name or has to know
 * that a failure can arrive two different ways. The caller *throws* on
 * transport failure (a non-2xx status, an rpcId mismatch, a malformed
 * envelope) and *returns* `{ok:false}` for a failure the host reported
 * deliberately. Both collapse into one outcome type here, because a panel that
 * has to handle two failure channels ends up handling neither.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EndpointMap, RequestOf, ResponseOf, TransportFailureCode } from '../../contract.js';
/**
 * The result of one endpoint call: a value, or a reason it did not arrive.
 *
 * The four codes are declared in the contract, so both the two produced here
 * and the two that arrive off the wire are the same vocabulary the browser
 * half has prose for.
 */
export type CallOutcome<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly code: TransportFailureCode;
    readonly message: string;
};
/** Typed access to every endpoint of the host half. */
export type ArchiveApi = {
    readonly [K in keyof EndpointMap]: (payload: RequestOf<K>, signal?: AbortSignal) => Promise<CallOutcome<ResponseOf<K>>>;
};
/**
 * Bind the endpoint set to a plugin context.
 *
 * `connection` is read through `ctx.get` at call time, not injected: the panel
 * is only ever built in response to a click, by which point the connection is
 * long since up, and a profile without it should leave the entry point visible
 * with an explanatory failure rather than never appear at all.
 *
 * @param ctx - the browser plugin context.
 * @returns one typed function per contract operation.
 */
export declare function createArchiveApi(ctx: Context): ArchiveApi;
