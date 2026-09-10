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

import type { Context } from '@deepseek-ai/cordis'

import { CHANNEL, endpointName } from '../../contract.js'
import type { EndpointMap, RequestOf, ResponseOf } from '../../contract.js'

/** The result of one endpoint call: a value, or a reason it did not arrive. */
export type CallOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string }

/** The connection service's browser-side RPC caller. */
interface RpcCaller {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }>
}

/** Typed access to every endpoint of the host half. */
export type ArchiveApi = {
  readonly [K in keyof EndpointMap]: (
    payload: RequestOf<K>,
    signal?: AbortSignal,
  ) => Promise<CallOutcome<ResponseOf<K>>>
}

/** Failure code for "the connection service is not mounted in this profile". */
const NO_CONNECTION = 'session-archive/no-connection'

/** Failure code for a transport-level throw. */
const TRANSPORT = 'session-archive/transport'

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
export function createArchiveApi(ctx: Context): ArchiveApi {
  async function invoke<K extends keyof EndpointMap>(
    operation: K,
    payload: RequestOf<K>,
    signal?: AbortSignal,
  ): Promise<CallOutcome<ResponseOf<K>>> {
    const connection = ctx.get('connection') as { rpc?: RpcCaller } | undefined
    const rpc = connection?.rpc
    if (rpc === undefined) {
      return { ok: false, code: NO_CONNECTION, message: 'this profile does not mount the connection service' }
    }
    try {
      const result = await rpc.call(CHANNEL, endpointName(operation), payload, signal)
      return result.ok
        ? { ok: true, value: result.value as ResponseOf<K> }
        : { ok: false, code: result.error.code, message: result.error.message }
    } catch (error) {
      return { ok: false, code: TRANSPORT, message: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    capabilities: (payload, signal) => invoke('capabilities', payload, signal),
    list: (payload, signal) => invoke('list', payload, signal),
    unarchive: (payload, signal) => invoke('unarchive', payload, signal),
    delete: (payload, signal) => invoke('delete', payload, signal),
    archiveWorkspace: (payload, signal) => invoke('archiveWorkspace', payload, signal),
    archiveUngrouped: (payload, signal) => invoke('archiveUngrouped', payload, signal),
    shutdownAll: (payload, signal) => invoke('shutdownAll', payload, signal),
  }
}
