/**
 * Host half of the session archive plugin.
 *
 * Completes the workspace → archive area → delete chain that DSH itself stops
 * halfway through: the built-in archive is one-way, and there is no way to
 * remove a session log at all. Nothing here modifies, shadows, or forks a
 * built-in plugin.
 *
 * `apply` is written to be incapable of throwing. An exception escaping it does
 * not disable this plugin — it aborts the whole harness boot, so a user would
 * lose their entire DSH because a third-party plugin looked at a shape that had
 * moved.
 *
 * @module @dsh-plugins/session-archive
 */

import type { Context } from '@deepseek-ai/cordis'

import { Config } from './config.js'
import { AgentTeardown } from './host/agent-teardown.js'
import { ArchiveWriter } from './host/archive-writer.js'
import { describeCapabilities, probeCapabilities } from './host/capabilities.js'
import { describeError } from './host/errors.js'
import type { AgentRegistryLike } from './host/agent-teardown.js'
import { backendName, describeSessionRoot, resolveSessionRoot } from './host/internals/jsonl-backend.js'
import type { DomainFacilityLike } from './host/internals/workspace-state.js'
import type { ProjectionCacheLike } from './host/metadata-reader.js'
import { LogRemover } from './host/log-remover.js'
import { MetadataReader } from './host/metadata-reader.js'
import { SessionArchiveService } from './host/service.js'
import { registerEndpoints } from './host/transport/endpoint-router.js'
import { readStringArray, readString } from './host/payload.js'

export { Config } from './config.js'
export const name = 'session-archive'

/** Substituted by `build.mjs` from `package.json`; absent under a bare `tsc` or vitest run. */
declare const __PLUGIN_VERSION__: string

/**
 * Published plugin version, echoed to the browser half so a stale bundle shows up.
 *
 * Injected at build time rather than written here, because the whole point of
 * echoing it is to catch a bundle that disagrees with its manifest — a value
 * kept in sync by hand cannot detect the one thing it exists to detect. The
 * fallback only ever appears when the module is loaded straight from source.
 */
const VERSION = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '0.0.0-source'

/**
 * Hard dependencies, declared so cordis holds `apply` until they are ready.
 *
 * Only direct property access needs this: `ctx.foo` goes through a Guard that
 * throws for an undeclared service, while `ctx.get('foo')` bypasses it and
 * needs no declaration. Everything degradable is read that way instead, which
 * is the host's own optional-dependency idiom.
 *
 * A misspelling here fails silently — the plugin simply never activates — so
 * these four names are the ones to check first if nothing happens at all.
 */
export const inject = ['connection', 'workspaceRegistry', 'sessionPersistence'] as const

/**
 * Mount the host half.
 * @param ctx - the plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  try {
    mount(ctx, config)
  } catch (error) {
    // Last line of defence. A third-party plugin must never be the reason the
    // harness fails to boot.
    ctx.logger.error(`session-archive: failed to mount; the plugin is inert: ${describeError(error)}`)
  }
}

function mount(ctx: Context, config: Config): void {
  const registry = ctx.workspaceRegistry
  const persistence = ctx.sessionPersistence
  const storageDomain = ctx.get('storageDomain') as DomainFacilityLike | undefined
  const projectionCache = ctx.get('sessionProjectionCache') as ProjectionCacheLike | undefined

  const agents = ctx.get('agents') as AgentRegistryLike | undefined

  const sessionRoot = resolveSessionRoot(persistence, config.sessionRoot)
  const capabilities = probeCapabilities({
    registry: ctx.registry,
    agents,
    workspaceRegistry: registry,
    persistence,
    storageDomain,
    projectionCache,
    sessionRoot,
  })
  ctx.logger.info(
    [
      'session-archive: capability probe',
      `  session log root: ${describeSessionRoot(sessionRoot)}`,
      ...describeCapabilities(capabilities),
    ].join('\n'),
  )

  const archive = new ArchiveWriter({ registry, storageDomain })
  const teardown = new AgentTeardown({ registry: ctx.registry, agents, logger: ctx.logger })
  const metadata = new MetadataReader({ persistence, projectionCache, logger: ctx.logger })
  const remover = new LogRemover({
    persistence,
    registry,
    teardown,
    archive,
    sessionRoot,
    logger: ctx.logger,
  })

  const service = new SessionArchiveService({
    capabilities,
    persistenceBackend: backendName(persistence),
    version: VERSION,
    registry,
    metadata,
    archive,
    teardown,
    remover,
  })

  registerEndpoints(ctx, {
    capabilities: async () => service.capabilities(),
    list: async () => service.list(),
    unarchive: async (payload) => service.unarchive(readStringArray(payload, 'ids')),
    delete: async (payload) => service.delete(readStringArray(payload, 'ids')),
    archiveWorkspace: async (payload) => service.archiveWorkspace(readString(payload, 'workspaceId')),
    archiveUngrouped: async () => service.archiveUngrouped(),
    running: async () => service.running(),
    shutdown: async (payload) => service.shutdown(readStringArray(payload, 'ids')),
  })
}
