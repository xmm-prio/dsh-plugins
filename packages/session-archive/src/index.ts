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
import type { DomainFacilityLike } from './host/internals/workspace-state.js'
import type { ProjectionCacheLike } from './host/metadata-reader.js'
import { LogRemover } from './host/log-remover.js'
import { MetadataReader } from './host/metadata-reader.js'
import { SessionArchiveService } from './host/service.js'
import { registerEndpoints } from './host/transport/endpoint-router.js'
import { readStringArray, readString } from './host/payload.js'

export { Config } from './config.js'
export const name = 'session-archive'

/** Published plugin version, echoed to the browser half so a stale bundle shows up. */
const VERSION = '0.1.0'

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

  const capabilities = probeCapabilities({
    registry: ctx.registry,
    workspaceRegistry: registry,
    persistence,
    storageDomain,
    projectionCache,
  })
  ctx.logger.info(['session-archive: capability probe', ...describeCapabilities(capabilities)].join('\n'))

  const archive = new ArchiveWriter({ registry, storageDomain })
  const teardown = new AgentTeardown({
    registry: ctx.registry,
    agents: ctx.get('agents') as AgentRegistryLike | undefined,
  })
  const metadata = new MetadataReader({ persistence, projectionCache, logger: ctx.logger })
  const remover = new LogRemover({
    persistence,
    registry,
    teardown,
    archive,
    sessionRoot: config.sessionRoot,
    logger: ctx.logger,
  })

  const service = new SessionArchiveService({
    capabilities,
    persistenceBackend: typeof persistence.name === 'string' ? persistence.name : '(unnamed)',
    version: VERSION,
    registry,
    metadata,
    archive,
    teardown,
    remover,
  })

  registerEndpoints(ctx, {
    capabilities: async () => service.capabilities(),
    list: async (_payload, signal) => service.list(signal),
    unarchive: async (payload) => service.unarchive(readStringArray(payload, 'ids')),
    delete: async (payload) => service.delete(readStringArray(payload, 'ids')),
    archiveWorkspace: async (payload, signal) => service.archiveWorkspace(readString(payload, 'workspaceId'), signal),
    archiveUngrouped: async (_payload, signal) => service.archiveUngrouped(signal),
    shutdownAll: async () => service.shutdownAll(),
  })
}
