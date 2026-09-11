/**
 * The wire boundary, exercised through the route it actually registers.
 *
 * The cancellation-token gate is tested from the outside rather than by
 * exporting it, so what is pinned is the promise handlers rely on — "the
 * signal you are given is one you can forward" — and not a private helper.
 */

import { describe, expect, it } from 'vitest'

import { OPERATIONS, endpointName, endpointPath } from '../src/contract.js'
import { registerEndpoints } from '../src/host/transport/endpoint-router.js'
import type { EndpointHandlers } from '../src/host/transport/endpoint-router.js'

/** A registered `/api` route, as the connection service would hold it. */
interface Route {
  readonly path: string
  fetch(request: Request): Promise<Response>
}

/** The warnings and errors a run produced. */
interface Log {
  readonly warnings: string[]
  readonly errors: string[]
}

/**
 * Register the endpoints against a stand-in context and hand back the routes.
 *
 * Only the three members the router touches are provided; anything else it
 * reached for would fail loudly rather than silently doing nothing.
 */
function mount(handlers: Partial<EndpointHandlers>): { routes: Map<string, Route>; log: Log } {
  const routes = new Map<string, Route>()
  const log: Log = { warnings: [], errors: [] }
  const ctx = {
    connection: {
      fetch: {
        register(route: Route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
    effect(create: () => unknown) {
      create()
    },
    logger: {
      warn: (message: string) => log.warnings.push(message),
      error: (message: string) => log.errors.push(message),
    },
  }
  const table = Object.fromEntries(
    OPERATIONS.map((operation) => [operation, handlers[operation] ?? (async () => ({}))]),
  ) as EndpointHandlers
  registerEndpoints(ctx as never, table)
  return { routes, log }
}

/**
 * A request carrying `signal`, whatever `signal` happens to be.
 *
 * A real `Request` always has a well-formed `AbortSignal`, which is precisely
 * the case that never failed — the runtime under test is one where it is
 * malformed, so the object is built rather than borrowed. The route only
 * reads `json()` and `signal`.
 */
function requestWith(signal: unknown, method: string): Request {
  return { json: async () => ({ type: 'client-request', rpcId: RPC_ID, method, payload: {} }), signal } as Request
}

const RPC_ID = '11111111-1111-1111-1111-111111111111'

/** The envelope a route answers with, decoded. */
async function callList(signal: unknown, handler: EndpointHandlers['list']) {
  const { routes, log } = mount({ list: handler })
  const route = routes.get(endpointPath('list'))
  expect(route).toBeDefined()
  const response = await route!.fetch(requestWith(signal, endpointName('list')))
  return { body: (await response.json()) as { result: { ok: boolean; error?: { code: string; message: string } } }, log }
}

describe('the endpoint router', () => {
  it('mounts one route per contract operation', () => {
    const { routes } = mount({})
    expect([...routes.keys()].sort()).toEqual(OPERATIONS.map(endpointPath).sort())
  })

  it('forwards a cancellation token the host can actually use', async () => {
    const real = new AbortController().signal
    let seen: AbortSignal | undefined | 'unset' = 'unset'
    const { body } = await callList(real, async (_payload, signal) => {
      seen = signal
      return { entries: [], totalSizeBytes: 0, unresolved: [], degraded: false }
    })
    expect(seen).toBe(real)
    expect(body.result.ok).toBe(true)
  })

  it.each([
    ['a signal from a runtime without throwIfAborted', { aborted: false, addEventListener() {} }],
    ['a signal that is not a signal at all', {}],
    ['no signal', undefined],
  ])('withholds %s rather than handing on something unusable', async (_name, signal) => {
    let seen: AbortSignal | undefined | 'unset' = 'unset'
    const { body } = await callList(signal, async (_payload, given) => {
      seen = given
      return { entries: [], totalSizeBytes: 0, unresolved: [], degraded: false }
    })
    expect(seen).toBeUndefined()
    expect(body.result.ok).toBe(true)
  })

  it('reports a throwing handler as handler-failed, and says so in the log', async () => {
    const { body, log } = await callList(new AbortController().signal, async () => {
      throw new TypeError('signal?.throwIfAborted is not a function')
    })
    expect(body.result.ok).toBe(false)
    expect(body.result.error?.code).toBe('session-archive/handler-failed')
    expect(body.result.error?.message).toContain('throwIfAborted')
    expect(log.warnings).toHaveLength(1)
    expect(log.warnings[0]).toContain('session-archive.list failed')
  })
})
