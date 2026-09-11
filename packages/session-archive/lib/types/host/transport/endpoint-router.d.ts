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
import type { Context } from '@deepseek-ai/cordis';
import type { EndpointMap, ResponseOf } from '../../contract.js';
/**
 * One endpoint implementation. The payload arrives untyped, straight off the
 * wire.
 *
 * The request's cancellation token is deliberately not handed on. Every
 * operation ends in a host read, and where those take a token — or whether
 * they take one positionally or in an options object — varies by DSH version;
 * see `PersistenceLike` in `host/internals/jsonl-backend.ts` for what guessing
 * wrong costs. Cancellation is an optimization these short reads can do
 * without, so the token stops here rather than being threaded through three
 * layers to a call that may not want it.
 */
export type EndpointHandler<K extends keyof EndpointMap> = (payload: unknown) => Promise<ResponseOf<K>>;
/** The complete endpoint table; every operation in the contract must be answered. */
export type EndpointHandlers = {
    readonly [K in keyof EndpointMap]: EndpointHandler<K>;
};
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
export declare function registerEndpoints(ctx: Context, handlers: EndpointHandlers): void;
