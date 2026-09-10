/**
 * Composition of the contract endpoints out of the host-facing collaborators.
 *
 * The only place capability gating happens: a disabled capability refuses here,
 * once, instead of every collaborator re-checking. Nothing in this file talks
 * to the wire, and nothing in it touches a host private shape.
 */

import type {
  ArchiveListResult,
  ArchivedSessionEntry,
  BatchResult,
  BulkArchiveResult,
  BulkRefusalCode,
  CapabilitiesResult,
  CapabilityId,
  CapabilityReport,
  OperationFailure,
} from '../contract.js'
import { planBulkArchive } from '../domain/grouping.js'
import type { BulkArchiveScope, GroupingInput, SessionListEntry } from '../domain/grouping.js'
import type { AgentTeardown } from './agent-teardown.js'
import type { ArchiveWriter } from './archive-writer.js'
import type { LogRemover } from './log-remover.js'
import { updatedAtOf } from './metadata-reader.js'
import type { CatalogRow, MetadataReader } from './metadata-reader.js'
import type { WorkspaceRegistryLike } from './internals/workspace-state.js'
import { failure } from './outcome.js'

/** Collaborators the endpoint layer composes. */
export interface SessionArchiveDeps {
  readonly capabilities: CapabilityReport
  readonly persistenceBackend: string
  readonly version: string
  readonly registry: WorkspaceRegistryLike
  readonly metadata: MetadataReader
  readonly archive: ArchiveWriter
  readonly teardown: AgentTeardown
  readonly remover: LogRemover
}

/** Name a disabled capability and the host shape that disabled it. */
function capabilityDetail(capability: CapabilityId, report: CapabilityReport): string {
  const status = report[capability]
  return `${capability} is disabled: ${status.code ?? 'unknown'} (${status.subject ?? 'unknown'})`
}

/** Refuse a whole batch because the capability behind it is off. */
function refuseBatch(ids: readonly string[], capability: CapabilityId, report: CapabilityReport): BatchResult {
  const detail = capabilityDetail(capability, report)
  return { outcomes: ids.map((id) => failure(id, 'capability-disabled', detail)) }
}

/** Refuse a whole bulk archive without touching a single session. */
function refuseBulk(code: BulkRefusalCode, detail: string): BulkArchiveResult {
  return { archived: [], skipped: [], failed: [], refusal: { code, detail } }
}

/** The endpoint implementations, one method per contract operation. */
export class SessionArchiveService {
  constructor(private readonly deps: SessionArchiveDeps) {}

  /** The startup probe's verdict, plus enough context to diagnose a blocked one. */
  capabilities(): CapabilitiesResult {
    return {
      capabilities: this.deps.capabilities,
      persistenceBackend: this.deps.persistenceBackend,
      version: this.deps.version,
    }
  }

  /**
   * The archive area's contents.
   *
   * Ordered newest activity first, matching the built-in session list, so a
   * user moving between the sidebar and the archive area sees one ordering.
   *
   * @param signal - caller cancellation.
   * @returns the rows, their total size, and the ids that resolve to nothing.
   */
  async list(signal?: AbortSignal): Promise<ArchiveListResult> {
    const archived = new Set(this.deps.archive.archived())
    const catalog = await this.deps.metadata.catalog(signal)
    const workspaceOf = this.workspaceIndex()

    const rows = catalog.rows.filter((row) => archived.has(row.id))
    const found = new Set(rows.map((row) => row.id))
    const entries = rows
      .sort((left, right) => updatedAtOf(right) - updatedAtOf(left))
      .map((row) => this.entryOf(row, workspaceOf))

    return {
      entries,
      totalSizeBytes: entries.reduce((total, entry) => total + (entry.sizeBytes ?? 0), 0),
      // An archived id the persistence backend no longer lists: the log was
      // removed outside this plugin, so the archive set has a dangling member.
      unresolved: [...archived].filter((id) => !found.has(id)),
      degraded: catalog.degraded,
    }
  }

  /** Take sessions out of the archive set, making them visible again. */
  async unarchive(ids: readonly string[]): Promise<BatchResult> {
    if (!this.deps.capabilities.unarchive.available) {
      return refuseBatch(ids, 'unarchive', this.deps.capabilities)
    }
    return { outcomes: await this.deps.archive.unarchive(ids) }
  }

  /** Delete archived sessions' logs. */
  async delete(ids: readonly string[]): Promise<BatchResult> {
    if (!this.deps.capabilities.delete.available) {
      return refuseBatch(ids, 'delete', this.deps.capabilities)
    }
    return { outcomes: await this.deps.remover.remove(ids) }
  }

  /** Archive every session displayed under one workspace row. */
  async archiveWorkspace(workspaceId: string, signal?: AbortSignal): Promise<BulkArchiveResult> {
    return this.bulkArchive({ kind: 'workspace', workspaceId }, signal)
  }

  /** Archive every session displayed under the ungrouped row. */
  async archiveUngrouped(signal?: AbortSignal): Promise<BulkArchiveResult> {
    return this.bulkArchive({ kind: 'ungrouped' }, signal)
  }

  /** Stop every running agent, releasing their background resources. */
  async shutdownAll(): Promise<BatchResult> {
    if (!this.deps.capabilities.shutdown.available) {
      return refuseBatch(this.deps.teardown.liveSessionIds(), 'shutdown', this.deps.capabilities)
    }
    return { outcomes: await this.deps.teardown.teardownAll() }
  }

  private async bulkArchive(scope: BulkArchiveScope, signal?: AbortSignal): Promise<BulkArchiveResult> {
    if (!this.deps.capabilities.archive.available) {
      return refuseBulk('capability-disabled', capabilityDetail('archive', this.deps.capabilities))
    }

    const plan = planBulkArchive({ ...(await this.groupingInput(signal)), scope })
    if (plan.unknownScope) {
      return refuseBulk(
        'unknown-scope',
        scope.kind === 'workspace' ? `workspace "${scope.workspaceId}" has no ledger` : 'no ungrouped row',
      )
    }

    const outcomes = await this.deps.archive.archive(plan.targets)
    return {
      archived: outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id),
      skipped: plan.skipped,
      failed: outcomes.filter((outcome): outcome is OperationFailure => !outcome.ok),
    }
  }

  /** Read the host once and shape it into what the grouping rules consume. */
  private async groupingInput(signal?: AbortSignal): Promise<GroupingInput> {
    const catalog = await this.deps.metadata.catalog(signal)
    return {
      sessions: catalog.rows.map(sessionEntryOf),
      workspaces: this.deps.registry.list().map((workspace) => ({
        workspaceId: workspace.id,
        sessionIds: workspace.sessionIds,
      })),
      archived: new Set(this.deps.archive.archived()),
      // The host has no notion of which session the browser has selected, and
      // it does not need one: every blank session is skipped either way.
      current: undefined,
    }
  }

  /** Which workspace's ledger still holds each session. */
  private workspaceIndex(): ReadonlyMap<string, { id: string; title: string }> {
    const index = new Map<string, { id: string; title: string }>()
    for (const workspace of this.deps.registry.list()) {
      for (const sessionId of workspace.sessionIds) {
        index.set(sessionId, { id: workspace.id, title: workspace.title })
      }
    }
    return index
  }

  private entryOf(
    row: CatalogRow,
    workspaceOf: ReadonlyMap<string, { id: string; title: string }>,
  ): ArchivedSessionEntry {
    const workspace = workspaceOf.get(row.id)
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      lastActivityAt: row.lastPromptAt,
      sizeBytes: row.sizeBytes,
      cwd: row.cwd,
      workspaceId: workspace?.id,
      workspaceTitle: workspace?.title,
    }
  }
}

/** Project a catalog row onto the facts grouping needs. */
function sessionEntryOf(row: CatalogRow): SessionListEntry {
  return { id: row.id, origin: row.origin, blank: row.blank }
}
