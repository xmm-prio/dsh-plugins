/**
 * The host half's wire boundary: `/api` route registration and RPC envelope
 * coding. Endpoint handlers below this module never see an envelope, a
 * `Request`, or a `Response`.
 *
 * `ctx.connection.rpc.handle()` would be the natural home for this, but it is
 * broken in 0.1.5-rc.1 — it reaches for `owner.webServer` from a context that
 * never injected it, and because that happens inside `apply` it takes the whole
 * harness boot down with it. Exact `/api` fetch routes are the supported path,
 * they inherit the same Host/Origin fence and token authentication, and the
 * browser's `connection.rpc.call('/api', …)` still reaches them because the
 * shared handler consults the exact-route table before its Gateway fallback.
 */

import type { Context } from '@deepseek-ai/cordis'

import { CHANNEL, OPERATIONS, TRANSPORT_FAILURE, endpointName, endpointPath } from '../../contract.js'
import type { EndpointMap, ResponseOf, TransportFailureCode } from '../../contract.js'
import { describeError } from '../errors.js'

/**
 * One endpoint implementation. The payload arrives untyped, straight off the
 * wire, and the signal is absent whenever the request did not come with one
 * this host can use — see {@link usableSignal}.
 */
export type EndpointHandler<K extends keyof EndpointMap> = (
  payload: unknown,
  signal: AbortSignal | undefined,
) => Promise<ResponseOf<K>>

/** The complete endpoint table; every operation in the contract must be answered. */
export type EndpointHandlers = { readonly [K in keyof EndpointMap]: EndpointHandler<K> }

/** The `rpcId` echoed when the request was too malformed to carry one. */
const UNKNOWN_RPC_ID = '00000000-0000-0000-0000-000000000000'

interface ClientRequestEnvelope {
  readonly rpcId: string
  readonly method: string
  readonly payload: unknown
}

/** Decode a `client-request` envelope, or explain why it is not one. */
function decodeRequest(body: unknown): ClientRequestEnvelope | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'body is not a JSON object'
  const record = body as Record<string, unknown>
  if (record['type'] !== 'client-request') return 'envelope type must be "client-request"'
  if (typeof record['rpcId'] !== 'string') return 'envelope rpcId must be a string'
  if (typeof record['method'] !== 'string') return 'envelope method must be a string'
  return { rpcId: record['rpcId'], method: record['method'], payload: record['payload'] }
}

/** Wrap a value in the success envelope the browser caller validates. */
function successEnvelope(rpcId: string, value: unknown): Response {
  return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
}

/**
 * Wrap a failure in the failure envelope.
 *
 * Always HTTP 200: a non-2xx status makes the browser caller throw a transport
 * error that carries none of this detail, and the panel would have nothing to
 * show the user.
 */
function failureEnvelope(rpcId: string, code: TransportFailureCode, message: string): Response {
  return Response.json({ type: 'server-response', rpcId, result: { ok: false, error: { code, message, details: {} } } })
}

/**
 * The request's cancellation token, if it is one the host's own APIs can use.
 *
 * Handlers do not merely observe this signal, they hand it back to the host:
 * `list` forwards it into `persistence.list()`, which calls
 * `signal.throwIfAborted()` on it. That method arrived in Node 17.3, so on an
 * older runtime the property is there and the method is not, and forwarding
 * turns the call into `TypeError: signal?.throwIfAborted is not a function` —
 * an entire operation lost to a feature nobody asked for.
 *
 * Cancellation is an optimization and never a correctness requirement, so an
 * unusable token is dropped rather than passed on. The cost is a listing that
 * cannot be abandoned early; the alternative is an archive area that will not
 * open at all.
 *
 * The question is settled here, once, because this module already owns
 * everything about the wire — every handler below it should receive either a
 * signal it can use or nothing, and never have to ask which it got.
 */
function usableSignal(signal: AbortSignal | undefined): AbortSignal | undefined {
  return typeof signal?.throwIfAborted === 'function' ? signal : undefined
}

/**
 * Mount every contract endpoint as an exact `/api` route on the caller's fiber.
 *
 * Registration goes through `ctx.effect`, so plugin unload removes the routes.
 * Nothing here throws: a route that cannot be registered is logged and skipped,
 * because an exception escaping `apply` aborts the entire harness boot.
 *
 * @param ctx - the plugin context, with `connection` injected.
 * @param handlers - one implementation per contract operation.
 */
export function registerEndpoints(ctx: Context, handlers: EndpointHandlers): void {
  for (const operation of OPERATIONS) {
    const method = endpointName(operation)
    const handler = handlers[operation] as EndpointHandler<keyof EndpointMap>
    const route = {
      path: endpointPath(operation),
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return failureEnvelope(UNKNOWN_RPC_ID, TRANSPORT_FAILURE.badRequest, 'request body is not valid JSON')
        }
        const envelope = decodeRequest(body)
        if (typeof envelope === 'string') {
          return failureEnvelope(UNKNOWN_RPC_ID, TRANSPORT_FAILURE.badRequest, envelope)
        }
        if (envelope.method !== method) {
          return failureEnvelope(
            envelope.rpcId,
            TRANSPORT_FAILURE.badRequest,
            `method ${envelope.method} does not match ${method}`,
          )
        }
        try {
          return successEnvelope(envelope.rpcId, await handler(envelope.payload, usableSignal(request.signal)))
        } catch (error) {
          ctx.logger.warn(`session-archive: endpoint ${method} failed: ${describeError(error)}`)
          return failureEnvelope(envelope.rpcId, TRANSPORT_FAILURE.handlerFailed, describeError(error))
        }
      },
    }

    try {
      ctx.effect(() => ctx.connection.fetch.register(route), `session-archive: ${CHANNEL} route ${method}`)
    } catch (error) {
      ctx.logger.error(`session-archive: could not mount ${route.path}: ${describeError(error)}`)
    }
  }
}
