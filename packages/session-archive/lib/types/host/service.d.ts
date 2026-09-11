/**
 * Composition of the contract endpoints out of the host-facing collaborators.
 *
 * The only place capability gating happens: a disabled capability refuses here,
 * once, instead of every collaborator re-checking. Nothing in this file talks
 * to the wire, and nothing in it touches a host private shape.
 */
import type { ArchiveListResult, BatchResult, BulkArchiveResult, CapabilitiesResult, CapabilityReport } from '../contract.js';
import type { AgentTeardown } from './agent-teardown.js';
import type { ArchiveWriter } from './archive-writer.js';
import type { LogRemover } from './log-remover.js';
import type { MetadataReader } from './metadata-reader.js';
import type { WorkspaceRegistryLike } from './internals/workspace-state.js';
/** Collaborators the endpoint layer composes. */
export interface SessionArchiveDeps {
    readonly capabilities: CapabilityReport;
    readonly persistenceBackend: string;
    readonly version: string;
    readonly registry: WorkspaceRegistryLike;
    readonly metadata: MetadataReader;
    readonly archive: ArchiveWriter;
    readonly teardown: AgentTeardown;
    readonly remover: LogRemover;
}
/** The endpoint implementations, one method per contract operation. */
export declare class SessionArchiveService {
    private readonly deps;
    constructor(deps: SessionArchiveDeps);
    /** The startup probe's verdict, plus enough context to diagnose a blocked one. */
    capabilities(): CapabilitiesResult;
    /**
     * The archive area's contents.
     *
     * Ordered newest activity first, matching the built-in session list, so a
     * user moving between the sidebar and the archive area sees one ordering.
     *
     * @param signal - caller cancellation.
     * @returns the rows, their total size, and the ids that resolve to nothing.
     */
    list(signal?: AbortSignal): Promise<ArchiveListResult>;
    /** Take sessions out of the archive set, making them visible again. */
    unarchive(ids: readonly string[]): Promise<BatchResult>;
    /** Delete archived sessions' logs. */
    delete(ids: readonly string[]): Promise<BatchResult>;
    /** Archive every session displayed under one workspace row. */
    archiveWorkspace(workspaceId: string, signal?: AbortSignal): Promise<BulkArchiveResult>;
    /** Archive every session displayed under the ungrouped row. */
    archiveUngrouped(signal?: AbortSignal): Promise<BulkArchiveResult>;
    /** Stop every running agent, releasing their background resources. */
    shutdownAll(): Promise<BatchResult>;
    private bulkArchive;
    /** Shape an already-read catalog into what the grouping rules consume. */
    private groupingInput;
    /** Which workspace's ledger still holds each session. */
    private workspaceIndex;
    private entryOf;
}
