/**
 * Test-fixture plugin: real workspaces and real session logs, on demand.
 *
 * Everything here goes through the host's own services — `workspaceRegistry`
 * and `sessionPersistence` — so the sidebar under test sees exactly what it
 * would see for user-created data. Nothing is faked at the DOM or store level.
 *
 * Only ever mounted by the e2e harness, against a scratch `DSH_HOME`.
 */

import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export const name = 'session-archive-e2e-fixtures'

export const inject = ['connection', 'workspaceRegistry', 'sessionPersistence']

/** Session header format version accepted by the 0.1.5-rc.1 JSONL backend. */
const SESSION_FORMAT_VERSION = 3

/** Endpoints, mounted under `/api` so they inherit the token and Origin fence. */
const ENDPOINTS = ['seed', 'snapshot', 'archive', 'addSession', 'agents', 'resume', 'lifecycle']

/**
 * Mount the fixture endpoints.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ root: string }} config - scratch directory the fixture workspaces live in.
 */
export function apply(ctx, config) {
  const root = config.root

  /** Create one stored session whose cwd is `cwd`, and return its id. */
  async function createSession(cwd) {
    const id = randomUUID()
    const handle = await ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION,
      id,
      createdAt: Date.now(),
      cwd,
      isSeeded: false,
    })
    // Flush materializes the log so `list()` and the sidebar see it from a
    // cold read; close releases the write lease the create took.
    await handle.flush()
    await handle.close()
    return id
  }

  /** Create a workspace directory, register it, and fill it with sessions. */
  async function createWorkspace({ dir, title, sessions }) {
    const path = join(root, dir)
    await mkdir(path, { recursive: true })
    const workspace = await ctx.workspaceRegistry.create(path, title)
    const ids = []
    for (let index = 0; index < sessions; index += 1) {
      const id = await createSession(path)
      await workspace.attachSession(id)
      ids.push(id)
    }
    return { workspaceId: workspace.id, path, title: workspace.title, sessionIds: ids }
  }

  const handlers = {
    /**
     * Build the fixture world.
     * @param payload - `{ workspaces: [{ dir, title, sessions }], ungrouped: n }`.
     */
    seed: async (payload) => {
      const workspaces = []
      for (const spec of payload.workspaces ?? []) workspaces.push(await createWorkspace(spec))

      // Ungrouped members need a real cwd that belongs to no workspace: the
      // session list drops a header without one before grouping ever runs.
      const strayDir = join(root, '__stray__')
      await mkdir(strayDir, { recursive: true })
      const ungrouped = []
      for (let index = 0; index < (payload.ungrouped ?? 0); index += 1) {
        ungrouped.push(await createSession(strayDir))
      }
      return { workspaces, ungrouped }
    },

    /** Add one session to an existing workspace, as a re-render trigger. */
    addSession: async (payload) => {
      const workspace = ctx.workspaceRegistry.get(payload.workspaceId)
      if (workspace === undefined) throw new Error(`no workspace ${payload.workspaceId}`)
      const id = await createSession(workspace.path)
      await workspace.attachSession(id)
      return { sessionId: id }
    },

    /** Archive session ids directly, to pre-load the archive set. */
    archive: async (payload) => {
      for (const id of payload.ids) await ctx.workspaceRegistry.archiveSession(id)
      return { archived: payload.ids.length }
    },

    /** Which sessions currently have a live agent, straight from the host registry. */
    agents: async () => ({ live: (ctx.get('agents')?.list() ?? []).map((agent) => agent.id) }),

    /**
     * Register a fake agent behind a real `agentLoop.lifecycle` effect.
     *
     * A real agent fails its teardown when `whenIdle()`, `scope.dispose()`, or
     * `handle.close()` throws; none of those are reachable without a model, so
     * the shape is reproduced here: same registry entry, same effect label,
     * same cordis machinery, with `mode` choosing how the disposer behaves.
     *
     * @param payload - `{ id, mode: 'ok' | 'reject' | 'reject-after-detach' }`.
     */
    lifecycle: async (payload) => {
      const { id, mode = 'ok' } = payload
      const registry = ctx.get('agents')
      if (registry === undefined) throw new Error('no agents registry in this profile')
      // `enter`, not `register`: announcing runs the host's own `agent/created`
      // listeners, which reach into parts of a real agent a fake cannot supply.
      // `enter` still puts the entry in `list()` and `roots()`, which is all the
      // teardown path reads. The ids are cross-checked, so the fake carries both.
      const detach = registry.enter({ id, session: { id } }, undefined)
      ctx.effect(function* () {
        yield async () => {
          if (mode === 'reject') return Promise.reject(new Error(`fixture teardown failure for ${id}`))
          if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 2_000))
          if (mode === 'slow-reject') {
            await new Promise((resolve) => setTimeout(resolve, 2_000))
            throw new Error(`fixture slow failure for ${id}`)
          }
          detach()
          if (mode === 'reject-after-detach') throw new Error(`fixture late failure for ${id}`)
          return undefined
        }
      }, `agentLoop.lifecycle(${id})`)
      return { installed: id, mode }
    },

    /**
     * Resume sessions into live agents the way the web UI does.
     *
     * The session controller is the only party that resumes on the web path,
     * so going through it puts the lifecycle effect on the same fiber a real
     * user's click would.
     */
    resume: async (payload) => {
      const controller = ctx.get('sessionController')
      if (controller === undefined) throw new Error('no sessionController in this profile')
      const resumed = []
      const failed = []
      for (const id of payload.ids) {
        const result = await controller.resolveAgent(id)
        if ('error' in result) failed.push({ id, error: String(result.error?.message ?? result.error) })
        else resumed.push(id)
      }
      return { resumed, failed }
    },

    /** The host's own view of the world, for assertions. */
    snapshot: async () => ({
      workspaces: ctx.workspaceRegistry.list().map((workspace) => ({
        workspaceId: workspace.id,
        title: workspace.title,
        path: workspace.path,
        sessionIds: [...workspace.sessionIds],
      })),
      archived: [...ctx.workspaceRegistry.archivedSessionIds],
      stored: (await ctx.sessionPersistence.list({})).map((snapshot) => snapshot.header.id),
    }),
  }

  for (const endpoint of ENDPOINTS) {
    ctx.effect(() =>
      ctx.connection.fetch.register({
        path: `/api/e2e-fixtures.${endpoint}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const message = await request.json()
          try {
            return Response.json({
              type: 'server-response',
              rpcId: message.rpcId ?? 'fixture',
              result: { ok: true, value: await handlers[endpoint](message.payload ?? {}) },
            })
          } catch (error) {
            return Response.json({
              type: 'server-response',
              rpcId: message.rpcId ?? 'fixture',
              result: { ok: false, error: { code: 'fixture/failed', message: String(error?.stack ?? error), details: {} } },
            })
          }
        },
      }),
    )
  }

  ctx.logger.info(`e2e fixtures: ${String(ENDPOINTS.length)} endpoints under /api/e2e-fixtures.*`)
}
