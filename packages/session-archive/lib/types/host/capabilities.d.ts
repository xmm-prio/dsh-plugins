/**
 * Startup shape probe.
 *
 * Most of this plugin's capabilities stand on host shapes that carry no
 * compatibility promise. The contract is: look once at startup, and when
 * something is missing turn *that* capability off and say which shape was
 * missing. Never infer behaviour from the presence of a method name, and never
 * discover the gap halfway through a delete.
 *
 * Every check here is a shape check. Nothing is called for effect — in
 * particular `enqueueOperation` is not test-driven, because queueing work on
 * the registry's mutex chain is not an observation.
 */
import type { CapabilityReport } from '../contract.js';
import type { PersistenceLike, SessionRoot } from './internals/jsonl-backend.js';
import type { DomainFacilityLike, WorkspaceRegistryLike } from './internals/workspace-state.js';
/** Everything the probe looks at, gathered by the caller so this stays pure. */
export interface HostSurfaces {
    /** `ctx.registry`, the cordis plugin registry the effect scan walks. */
    readonly registry: unknown;
    /** `ctx.get('agents')`; soft, and absent only where no agent can exist. */
    readonly agents: unknown;
    /** `ctx.workspaceRegistry`; a hard dependency, so normally present. */
    readonly workspaceRegistry: WorkspaceRegistryLike | undefined;
    /** `ctx.sessionPersistence`; a hard dependency, so normally present. */
    readonly persistence: PersistenceLike | undefined;
    /** `ctx.get('storageDomain')`; soft, and only the unarchive write needs it. */
    readonly storageDomain: DomainFacilityLike | undefined;
    /** `ctx.get('sessionProjectionCache')`; soft, and only metadata quality depends on it. */
    readonly projectionCache: unknown;
    /** The session log root, as established from the backend or the escape hatch. */
    readonly sessionRoot: SessionRoot;
}
/**
 * Decide which capabilities this host build supports.
 * @param surfaces - the host objects, gathered by the caller.
 * @returns one verdict per capability; a blocked one names the shape at fault.
 */
export declare function probeCapabilities(surfaces: HostSurfaces): CapabilityReport;
/**
 * Render the probe result as one log line per capability.
 * @param report - the probe verdict.
 * @returns human-readable lines for the startup log.
 */
export declare function describeCapabilities(report: CapabilityReport): string[];
