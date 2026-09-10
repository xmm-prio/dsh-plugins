/**
 * The single interface shared by the two halves of this plugin.
 *
 * Both the host half and the browser half compile this file into their own
 * bundle; nothing here may import a runtime dependency, and nothing here may
 * know how the wire works. Transport lives in `host/transport` and
 * `client/transport`.
 */

/** Shared RPC channel. `/api` is the only channel the browser caller can reach. */
export const CHANNEL = '/api'

/** Endpoint namespace, kept dot-separated so every route stays one `/api` segment. */
export const ENDPOINT_NAMESPACE = 'session-archive'

/** Compose the wire endpoint name for one operation. */
export function endpointName(operation: keyof EndpointMap): string {
  return `${ENDPOINT_NAMESPACE}.${operation}`
}

/** Compose the exact `/api` route path the host registers for one operation. */
export function endpointPath(operation: keyof EndpointMap): string {
  return `${CHANNEL}/${endpointName(operation)}`
}

// ---------------------------------------------------------------- capabilities

/** One thing this plugin can do, subject to the host exposing the shapes it needs. */
export type CapabilityId = 'archive' | 'unarchive' | 'delete' | 'shutdown' | 'metadata'

/**
 * Why a capability is off. Stable machine codes: the host half never composes
 * user-facing prose, the browser half renders it.
 */
export type CapabilityBlockCode =
  | 'workspace-registry-unavailable'
  | 'archive-api-missing'
  | 'enqueue-operation-missing'
  | 'registry-state-missing'
  | 'workspace-domain-unavailable'
  | 'fiber-scan-unavailable'
  | 'persistence-backend-unsupported'
  | 'log-resolver-missing'
  | 'projection-cache-unavailable'
  | 'session-list-unavailable'
  | 'probe-failed'

/** Verdict for one capability. */
export interface CapabilityStatus {
  readonly available: boolean
  /** Present exactly when `available` is false. */
  readonly code?: CapabilityBlockCode
  /** The host shape, service, or backend the probe found wanting. */
  readonly subject?: string
}

/** The startup probe's verdict on every capability. */
export type CapabilityReport = { readonly [K in CapabilityId]: CapabilityStatus }

/** Payload of the capabilities endpoint. */
export interface CapabilitiesResult {
  readonly capabilities: CapabilityReport
  /** `sessionPersistence.name`, shown in the panel's diagnostics line. */
  readonly persistenceBackend: string
  /** Plugin version, so a stale browser bundle is visible. */
  readonly version: string
}

// ------------------------------------------------------------------ list

/** One row of the archive area. */
export interface ArchivedSessionEntry {
  readonly id: string
  /** Resolved title, or undefined when no zero-I/O source had one. */
  readonly title: string | undefined
  readonly createdAt: number
  /** Last prompt time from the list-metadata projection, when cached. */
  readonly lastActivityAt: number | undefined
  /** On-disk size from the persistence snapshot, when the backend reports one. */
  readonly sizeBytes: number | undefined
  readonly cwd: string | undefined
  /** The workspace whose ledger still holds this session, if any. */
  readonly workspaceId: string | undefined
  readonly workspaceTitle: string | undefined
}

/** Payload of the list endpoint. */
export interface ArchiveListResult {
  readonly entries: readonly ArchivedSessionEntry[]
  readonly totalSizeBytes: number
  /** Archive-set members the persistence layer no longer knows about. */
  readonly unresolved: readonly string[]
  /** True when metadata was served without the projection cache. */
  readonly degraded: boolean
}

// ------------------------------------------------------------------ operations

/** Why one per-session operation did not succeed. */
export type FailureCode =
  | 'capability-disabled'
  | 'invalid-session-id'
  | 'not-archived'
  | 'archive-set-unreadable'
  | 'unknown-session'
  | 'teardown-effect-missing'
  | 'write-lease-held'
  | 'legacy-log-format'
  | 'log-path-refused'
  | 'remove-failed'
  | 'host-error'

/** One session-scoped operation that did not succeed. */
export interface OperationFailure {
  readonly id: string
  readonly ok: false
  readonly code: FailureCode
  readonly detail: string
}

/** Outcome of one session-scoped operation. */
export type OperationOutcome = { readonly id: string; readonly ok: true } | OperationFailure

/** Result of a batch of session-scoped operations. */
export interface BatchResult {
  readonly outcomes: readonly OperationOutcome[]
}

/** Why bulk archive left a member of the row alone. Mirrors the sidebar's own rules. */
export type ArchiveSkipReason = 'subagent' | 'already-archived' | 'blank'

/** Why a whole bulk archive was refused before any session was considered. */
export type BulkRefusalCode = 'capability-disabled' | 'unknown-scope'

/** Result of archiving everything in one display row. */
export interface BulkArchiveResult {
  readonly archived: readonly string[]
  readonly skipped: readonly { readonly id: string; readonly reason: ArchiveSkipReason }[]
  readonly failed: readonly OperationFailure[]
  /** Present when the action was refused as a whole; the other fields are then empty. */
  readonly refusal?: { readonly code: BulkRefusalCode; readonly detail: string }
}

// ------------------------------------------------------------------ groups

/**
 * One row of the built-in sidebar, as a bulk-archive target.
 *
 * Composed on the host so the membership rules live in exactly one place: the
 * browser half never re-derives which sessions a row displays.
 */
export interface ArchivableGroup {
  /** The workspace, or undefined for the ungrouped row. */
  readonly workspaceId: string | undefined
  readonly title: string | undefined
  /** Sessions the built-in sidebar currently renders under this row. */
  readonly visibleCount: number
  /** Of those, how many a bulk archive would actually archive. */
  readonly archivableCount: number
}

/** Payload of the groups endpoint. */
export interface GroupsResult {
  readonly groups: readonly ArchivableGroup[]
}

// ------------------------------------------------------------------ endpoints

/** Request payload of every endpoint, keyed by operation. */
export interface EndpointMap {
  capabilities: { readonly request: Record<string, never>; readonly response: CapabilitiesResult }
  list: { readonly request: Record<string, never>; readonly response: ArchiveListResult }
  groups: { readonly request: Record<string, never>; readonly response: GroupsResult }
  unarchive: { readonly request: { readonly ids: readonly string[] }; readonly response: BatchResult }
  delete: { readonly request: { readonly ids: readonly string[] }; readonly response: BatchResult }
  archiveWorkspace: { readonly request: { readonly workspaceId: string }; readonly response: BulkArchiveResult }
  archiveUngrouped: { readonly request: Record<string, never>; readonly response: BulkArchiveResult }
  shutdownAll: { readonly request: Record<string, never>; readonly response: BatchResult }
}

/** Every operation name, in a runtime-iterable form. */
export const OPERATIONS = [
  'capabilities',
  'list',
  'groups',
  'unarchive',
  'delete',
  'archiveWorkspace',
  'archiveUngrouped',
  'shutdownAll',
] as const satisfies readonly (keyof EndpointMap)[]

/** Request payload type of one operation. */
export type RequestOf<K extends keyof EndpointMap> = EndpointMap[K]['request']

/** Response payload type of one operation. */
export type ResponseOf<K extends keyof EndpointMap> = EndpointMap[K]['response']
