/**
 * Startup shape probe.
 *
 * Three of this plugin's four capabilities stand on host shapes that carry no
 * compatibility promise. The contract is: look once at startup, and when
 * something is missing turn *that* capability off and say which shape was
 * missing. Never infer behaviour from the presence of a method name, and never
 * discover the gap halfway through a delete.
 *
 * Every check here is a shape check. Nothing is called for effect — in
 * particular `enqueueOperation` is not test-driven, because queueing work on
 * the registry's mutex chain is not an observation.
 */

import type { CapabilityBlockCode, CapabilityId, CapabilityReport, CapabilityStatus } from '../contract.js'
import { probeEffectScan } from './internals/agent-effects.js'
import { probeDeletableBackend } from './internals/jsonl-backend.js'
import type { PersistenceLike } from './internals/jsonl-backend.js'
import { probePrivateWritePath, readWorkspaceDomainState } from './internals/workspace-state.js'
import type { DomainFacilityLike, WorkspaceRegistryLike } from './internals/workspace-state.js'

/** Everything the probe looks at, gathered by the caller so this stays pure. */
export interface HostSurfaces {
  /** `ctx.registry`, the cordis plugin registry the effect scan walks. */
  readonly registry: unknown
  /** `ctx.workspaceRegistry`; a hard dependency, so normally present. */
  readonly workspaceRegistry: WorkspaceRegistryLike | undefined
  /** `ctx.sessionPersistence`; a hard dependency, so normally present. */
  readonly persistence: PersistenceLike | undefined
  /** `ctx.get('storageDomain')`; soft, and only the unarchive write needs it. */
  readonly storageDomain: DomainFacilityLike | undefined
  /** `ctx.get('sessionProjectionCache')`; soft, and only metadata quality depends on it. */
  readonly projectionCache: unknown
}

const AVAILABLE: CapabilityStatus = { available: true }

function blocked(code: CapabilityBlockCode, subject: string): CapabilityStatus {
  return { available: false, code, subject }
}

/** The archive set can be read and appended to through the host's own API. */
function probeArchive(surfaces: HostSurfaces): CapabilityStatus {
  const registry = surfaces.workspaceRegistry
  if (registry === undefined) return blocked('workspace-registry-unavailable', 'ctx.workspaceRegistry')
  if (typeof registry.archiveSession !== 'function') {
    return blocked('archive-api-missing', 'workspaceRegistry.archiveSession')
  }
  if (!Array.isArray(registry.archivedSessionIds)) {
    return blocked('archive-api-missing', 'workspaceRegistry.archivedSessionIds')
  }
  if (surfaces.persistence === undefined || typeof surfaces.persistence.list !== 'function') {
    return blocked('session-list-unavailable', 'sessionPersistence.list')
  }
  return AVAILABLE
}

/** Removing an id from the archive set has no public API; both private members must be there. */
function probeUnarchive(surfaces: HostSurfaces, archive: CapabilityStatus): CapabilityStatus {
  if (!archive.available) return archive
  const write = probePrivateWritePath(surfaces.workspaceRegistry!)
  if (!write.ok) {
    return write.missing === 'enqueue-operation'
      ? blocked('enqueue-operation-missing', 'workspaceRegistry.enqueueOperation')
      : blocked('registry-state-missing', 'workspaceRegistry.state')
  }
  const read = readWorkspaceDomainState(surfaces.storageDomain)
  if (!read.ok) return blocked('workspace-domain-unavailable', `storageDomain.get('workspace'): ${read.reason}`)
  return AVAILABLE
}

/** Tearing an agent down means walking the cordis fiber tree for its lifecycle effect. */
function probeShutdown(surfaces: HostSurfaces): CapabilityStatus {
  return probeEffectScan(surfaces.registry) ? AVAILABLE : blocked('fiber-scan-unavailable', 'ctx.registry fibers')
}

/** Deleting needs teardown, an addressable log directory, and the archive-set write. */
function probeDelete(
  surfaces: HostSurfaces,
  shutdown: CapabilityStatus,
  unarchive: CapabilityStatus,
): CapabilityStatus {
  if (!shutdown.available) return shutdown
  if (surfaces.persistence === undefined) return blocked('session-list-unavailable', 'ctx.sessionPersistence')
  const backend = probeDeletableBackend(surfaces.persistence)
  if (!backend.ok) {
    return backend.missing === 'backend'
      ? blocked('persistence-backend-unsupported', backend.subject)
      : blocked('log-resolver-missing', backend.subject)
  }
  // The last step of a delete moves the id out of the archive set, so a delete
  // that cannot do that would leave the session visible again as a live,
  // ungrouped row pointing at a directory that no longer exists.
  if (!unarchive.available) return unarchive
  return AVAILABLE
}

/** Metadata always works; the projection cache only decides how much of it is filled in. */
function probeMetadata(surfaces: HostSurfaces): CapabilityStatus {
  if (surfaces.persistence === undefined || typeof surfaces.persistence.list !== 'function') {
    return blocked('session-list-unavailable', 'sessionPersistence.list')
  }
  const cache = surfaces.projectionCache
  if (typeof cache !== 'object' || cache === null || typeof (cache as { cachedSnapshot?: unknown }).cachedSnapshot !== 'function') {
    return blocked('projection-cache-unavailable', 'sessionProjectionCache.cachedSnapshot')
  }
  return AVAILABLE
}

/** Every capability blocked by the same cause, used when the probe itself fails. */
function allBlocked(code: CapabilityBlockCode, subject: string): CapabilityReport {
  const status = blocked(code, subject)
  const ids: readonly CapabilityId[] = ['archive', 'unarchive', 'delete', 'shutdown', 'metadata']
  return Object.fromEntries(ids.map((id) => [id, status])) as unknown as CapabilityReport
}

/**
 * Decide which capabilities this host build supports.
 * @param surfaces - the host objects, gathered by the caller.
 * @returns one verdict per capability; a blocked one names the shape at fault.
 */
export function probeCapabilities(surfaces: HostSurfaces): CapabilityReport {
  try {
    const archive = probeArchive(surfaces)
    const unarchive = probeUnarchive(surfaces, archive)
    const shutdown = probeShutdown(surfaces)
    return {
      archive,
      unarchive,
      shutdown,
      delete: probeDelete(surfaces, shutdown, unarchive),
      metadata: probeMetadata(surfaces),
    }
  } catch (error) {
    // A probe must never be the reason the harness fails to boot.
    return allBlocked('probe-failed', error instanceof Error ? error.message : String(error))
  }
}

/**
 * Render the probe result as one log line per capability.
 * @param report - the probe verdict.
 * @returns human-readable lines for the startup log.
 */
export function describeCapabilities(report: CapabilityReport): string[] {
  return (Object.keys(report) as CapabilityId[]).map((id) => {
    const status = report[id]
    return status.available ? `  ${id}: available` : `  ${id}: disabled (${status.code}; ${status.subject})`
  })
}
