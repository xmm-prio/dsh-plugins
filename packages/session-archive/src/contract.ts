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

/**
 * One thing this plugin can do, subject to the host exposing the shapes it needs.
 *
 * `deleteLegacy` is separate from `delete` because it stands on one extra
 * thing: a known session log root. A log the backend still addresses is
 * deletable without it, a pre-migration one is not.
 */
export type CapabilityId = 'archive' | 'unarchive' | 'delete' | 'deleteLegacy' | 'shutdown' | 'metadata'

/**
 * Why a capability is off. Stable machine codes: the host half never composes
 * user-facing prose, the browser half renders it.
 *
 * A code names the *capability* that is missing, never the host member that
 * carries it — a private member is free to be renamed upstream, and this
 * plugin promises that such a rename touches one file. The member name travels
 * as free text in {@link CapabilityStatus.subject} instead.
 */
export type CapabilityBlockCode =
  | 'workspace-registry-unavailable'
  | 'archive-api-missing'
  | 'private-write-path-missing'
  | 'workspace-domain-unavailable'
  | 'fiber-scan-unavailable'
  | 'persistence-backend-unsupported'
  | 'log-resolver-missing'
  | 'log-root-unknown'
  | 'projection-cache-unavailable'
  | 'session-list-unavailable'
  | 'probe-failed'

/** Verdict for one capability. */
export interface CapabilityStatus {
  readonly available: boolean
  /** Present exactly when `available` is false. */
  readonly code?: CapabilityBlockCode
  /**
   * Free text naming the exact host shape, service, member, or backend the
   * probe found wanting. The one place a host-private member name is allowed
   * to appear, and the reason a blocked capability can still say "宿主的 X
   * 不可用" without X being part of the code vocabulary.
   */
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

/**
 * The four ownership proofs a *self-derived* log directory must pass before it
 * is removed, expressed as the failure each one reports.
 *
 * A derived path is one this plugin composed because the backend refused to
 * name it, so nothing but these proofs stands between an irreversible `rm` and
 * a directory that was never this session's. All four are required; the first
 * that fails aborts the delete and is reported as-is, and nothing partial ever
 * happens.
 */
export type OwnershipFailureCode =
  /** The directory's name is not exactly the session id (`abc` never matches `abcdef`). */
  | 'ownership-basename-mismatch'
  /** The directory holds no `session.vN.jsonl[.zstd]`, so it is not a session log directory. */
  | 'ownership-generation-missing'
  /** The resolved absolute path does not sit under the session log root. */
  | 'ownership-outside-root'
  /** The path is relative, a volume root, or too shallow to be a session directory. */
  | 'ownership-unsafe-root'

/** Why one per-session operation did not succeed. */
export type FailureCode =
  | 'capability-disabled'
  | 'invalid-session-id'
  | 'not-archived'
  | 'archive-set-unreadable'
  | 'unknown-session'
  | 'teardown-effect-missing'
  | 'write-lease-held'
  | 'log-root-unknown'
  | 'legacy-log-not-found'
  | 'log-path-refused'
  | OwnershipFailureCode
  | 'remove-failed'
  /** The log is gone but the session is still registered in a workspace ledger. */
  | 'ledger-detach-failed'
  /** The log is gone and the ledgers are clean, but the id is still in the archive set. */
  | 'archive-set-stale'
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

// ------------------------------------------------------------------ transport

/**
 * Failures that happen around an endpoint rather than inside one.
 *
 * These never come out of {@link OperationOutcome}: they are raised by the two
 * transport modules when a call does not reach a handler, or when a handler
 * fails in a way it did not describe itself. They belong here for the same
 * reason every other code does — the browser half renders prose for a code it
 * knows, and a code it does not know can only be printed raw.
 */
export type TransportFailureCode =
  /** The request was not a well-formed envelope for this endpoint. */
  | 'session-archive/bad-request'
  /** The handler threw. The message is the host's, not a composed sentence. */
  | 'session-archive/handler-failed'
  /** This profile does not mount `connection`, so there is nothing to call. */
  | 'session-archive/no-connection'
  /** The call never reached the handler: network, status, or envelope shape. */
  | 'session-archive/transport'

/** The transport failure codes, addressable by name from both halves. */
export const TRANSPORT_FAILURE = {
  badRequest: 'session-archive/bad-request',
  handlerFailed: 'session-archive/handler-failed',
  noConnection: 'session-archive/no-connection',
  transport: 'session-archive/transport',
} as const satisfies Readonly<Record<string, TransportFailureCode>>

// ------------------------------------------------------------------ endpoints

/** Request payload of every endpoint, keyed by operation. */
export interface EndpointMap {
  capabilities: { readonly request: Record<string, never>; readonly response: CapabilitiesResult }
  list: { readonly request: Record<string, never>; readonly response: ArchiveListResult }
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
