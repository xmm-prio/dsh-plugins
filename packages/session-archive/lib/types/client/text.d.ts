/**
 * Every user-facing string, in one place.
 *
 * The vocabulary is fixed by the project glossary and is not free to drift:
 * 归档 is a visibility decision and must never be described as moving,
 * exporting, or copying anything; the inverse is 取消归档, never 恢复 or 还原;
 * sessions that belong to no workspace are 未分组, never 孤儿会话 or 游离会话.
 *
 * The host half never composes prose — it returns machine codes, which the
 * dictionaries below turn into sentences.
 */
import type { ArchiveSkipReason, BulkArchiveResult, BulkRefusalCode, CapabilityBlockCode, FailureCode } from '../contract.js';
import type { CallOutcome } from './transport/archive-api.js';
import type { RowButtonCopy } from './sidebar/row-buttons.js';
export declare const text: {
    /** Sidebar footer entry and the panel it opens. */
    readonly entryLabel: "归档区";
    readonly panelTitle: "归档区";
    readonly panelDescription: "已归档的会话不在侧栏显示。取消归档即可让它重新出现，删除会永久移除它的日志。";
    readonly close: "关闭";
    /** Row-level chrome. A session with no resolvable title falls back to its id. */
    readonly untitledWorkspace: "未命名工作区";
    readonly ungrouped: "未分组";
    readonly workspaceColumn: "原工作区";
    readonly createdAt: "创建于";
    readonly lastActivityAt: "最近活动";
    readonly size: "日志大小";
    readonly unknownSize: "未知";
    /** Title search. */
    readonly searchPlaceholder: "按标题搜索";
    readonly noMatch: "没有匹配的会话。";
    /** Actions. */
    readonly unarchive: "取消归档";
    readonly deleteAction: "删除";
    readonly selectAll: "全选";
    readonly clearSelection: "取消选择";
    readonly refresh: "刷新";
    readonly shutdownAll: "关闭所有运行中会话";
    readonly archiving: "正在归档…";
    /** Empty, loading, and failure states. */
    readonly loading: "正在读取归档区…";
    readonly empty: "归档区是空的。";
    readonly loadFailed: "读取归档区失败";
    readonly retry: "重试";
    /**
     * Said instead of 归档区是空的, and the distinction is the whole point: the
     * archive set may be full, it is the session catalog that could not be read.
     */
    readonly catalogUnreadable: "读不出会话目录，所以列不出归档区的内容。归档集合本身没有变化，也没有会话因此丢失。";
    /** Delete confirmation. */
    readonly deleteTitle: "删除会话日志";
    readonly deleteAcknowledge: "我明白删除后无法恢复。";
    readonly deleteConfirm: "永久删除";
    readonly deleteCancel: "取消";
    /** Diagnostics line at the bottom of the panel. */
    readonly backend: "持久化后端";
    readonly degradedMetadata: "投影缓存不可用，标题与活动时间可能缺失。";
    readonly unresolvedNotice: "个归档会话在持久化后端中已不存在。";
    /** Summaries. */
    readonly selectedCount: (n: number) => string;
    readonly totalSize: (size: string) => string;
    readonly hiddenBySearch: (n: number) => string;
    readonly groupSummary: (n: number, size: string) => string;
    readonly archivedCount: (n: number) => string;
    readonly unarchivedCount: (n: number) => string;
    readonly deletedCount: (n: number) => string;
    readonly skippedCount: (n: number) => string;
    readonly shutdownCount: (n: number) => string;
    readonly nothingToArchive: "这一行没有可归档的会话。";
    readonly nothingRunning: "当前没有运行中的会话。";
    readonly unknownWorkspace: "该工作区已不存在。";
    readonly partialFailure: (n: number) => string;
};
/** The catalog-read failure, with the host's own message behind it. */
export declare function catalogUnreadableText(reason: string): string;
/** Delete-confirmation body text, which names exactly what is about to happen. */
export declare function deleteDescription(count: number): string;
/** Prose for the bulk-archive button injected into each sidebar row. */
export declare const rowCopy: RowButtonCopy;
/** Render one bulk-archive result as a single line. */
export declare function bulkArchiveSummary(result: BulkArchiveResult): string;
/** Turn a failure code into a sentence. */
export declare function failureText(code: FailureCode): string;
/** Turn a failed call into a sentence. */
export declare function callFailureText(outcome: Extract<CallOutcome<unknown>, {
    ok: false;
}>): string;
/** Turn a bulk-refusal code into a sentence. */
export declare function refusalText(code: BulkRefusalCode): string;
/** Turn a capability block code into a sentence. */
export declare function blockText(code: CapabilityBlockCode): string;
/** Turn a bulk-archive skip reason into a sentence. */
export declare function skipText(reason: ArchiveSkipReason): string;
/** Localize the shared relative-time bucket so two surfaces date a session alike. */
export declare function relativeText(bucket: {
    unit: string;
    n: number;
}): string;
