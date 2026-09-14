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

import type {
  ArchiveSkipReason,
  BulkArchiveResult,
  BulkRefusalCode,
  CapabilityBlockCode,
  FailureCode,
  TransportFailureCode,
} from '../contract.js'
import type { CallOutcome } from './transport/archive-api.js'
import type { RowButtonCopy } from './sidebar/row-buttons.js'
import type { RowGroup } from './sidebar/adapter.js'

export const text = {
  /** Sidebar footer entry and the panel it opens. */
  entryLabel: '归档区',
  panelTitle: '归档区',
  panelDescription: '已归档的会话不在侧栏显示。取消归档即可让它重新出现，删除会永久移除它的日志。',
  close: '关闭',

  /** Row-level chrome. A session with no resolvable title falls back to its id. */
  untitledWorkspace: '未命名工作区',
  ungrouped: '未分组',
  workspaceColumn: '原工作区',
  createdAt: '创建于',
  lastActivityAt: '最近活动',
  size: '日志大小',
  unknownSize: '未知',

  /** Title search. */
  searchPlaceholder: '按标题搜索',
  noMatch: '没有匹配的会话。',

  /** Actions. */
  unarchive: '取消归档',
  deleteAction: '删除',
  selectAll: '全选',
  clearSelection: '取消选择',
  refresh: '刷新',
  shutdownAll: '关闭后台运行中的会话',
  shutdownSession: '关闭本会话的 agent',
  archiving: '正在归档…',

  /**
   * Shutdown confirmation.
   *
   * 关闭 is about the running agent, never about the session: the log stays,
   * the row stays, and opening the session again brings it back. The copy has
   * to carry that, because the word next to it in this panel is 删除.
   */
  shutdownTitle: '关闭运行中的会话',
  /** Not 关闭: the modal's own dismiss control already carries that word. */
  shutdownConfirm: '确认关闭',
  shutdownCancel: '取消',
  shutdownNote: '会话日志不受影响；下次打开会话时会重新载入。',
  shutdownCurrentExcluded: '你正在查看的会话不在其中。要关闭它，用会话标题栏上的按钮。',
  shutdownSessionTitle: '关闭这个会话的 agent',
  shutdownSessionNote: '正在进行的对话会被停止，它派出的子代理也会一并结束。会话日志不受影响。',

  /** Empty, loading, and failure states. */
  loading: '正在读取归档区…',
  empty: '归档区是空的。',
  loadFailed: '读取归档区失败',
  retry: '重试',
  /**
   * Said instead of 归档区是空的, and the distinction is the whole point: the
   * archive set may be full, it is the session catalog that could not be read.
   */
  catalogUnreadable: '读不出会话目录，所以列不出归档区的内容。归档集合本身没有变化，也没有会话因此丢失。',

  /** Delete confirmation. */
  deleteTitle: '删除会话日志',
  deleteAcknowledge: '我明白删除后无法恢复。',
  deleteConfirm: '永久删除',
  deleteCancel: '取消',

  /** Diagnostics line at the bottom of the panel. */
  backend: '持久化后端',
  degradedMetadata: '投影缓存不可用，标题与活动时间可能缺失。',
  unresolvedNotice: '个归档会话在持久化后端中已不存在。',

  /** Summaries. */
  selectedCount: (n: number) => `已选择 ${String(n)} 个`,
  totalSize: (size: string) => `共 ${size}`,
  hiddenBySearch: (n: number) => `${String(n)} 个未匹配已隐藏`,
  groupSummary: (n: number, size: string) => `${String(n)} 个会话 · ${size}`,
  archivedCount: (n: number) => `已归档 ${String(n)} 个会话`,
  unarchivedCount: (n: number) => `已取消归档 ${String(n)} 个会话`,
  deletedCount: (n: number) => `已删除 ${String(n)} 个会话的日志`,
  skippedCount: (n: number) => `跳过 ${String(n)} 个`,
  shutdownCount: (n: number) => `已关闭 ${String(n)} 个运行中会话`,
  nothingToArchive: '这一行没有可归档的会话。',
  nothingRunning: '当前没有在后台运行的会话。',
  sessionNotRunning: '这个会话当前没有运行中的 agent。',
  untitledSession: '未命名会话',
  unknownWorkspace: '该工作区已不存在。',
  partialFailure: (n: number) => `${String(n)} 个操作未成功`,
} as const

/** The catalog-read failure, with the host's own message behind it. */
export function catalogUnreadableText(reason: string): string {
  return reason.length > 0 ? `${text.catalogUnreadable}（${reason}）` : text.catalogUnreadable
}

/** Delete-confirmation body text, which names exactly what is about to happen. */
export function deleteDescription(count: number): string {
  return `即将永久删除 ${String(count)} 个会话的日志文件。这些会话会先被停止，随后从归档区和原工作区一并移除。此操作不可撤销。`
}

/** Shutdown-confirmation lead line, which names exactly how many and what happens. */
export function shutdownDescription(count: number): string {
  return `即将停止 ${String(count)} 个会话的 agent，释放它们占用的后台资源。正在进行的对话会被中断。`
}

/**
 * One shutdown result as a single line.
 *
 * The failures are named individually rather than counted. "1 个操作未成功"
 * tells a user nothing they can act on, and the whole point of closing agents
 * one at a time is that a session which refuses to stop is the interesting
 * one.
 */
export function shutdownReport(closed: number, failures: readonly { id: string; code: FailureCode }[]): string {
  return [
    ...(closed > 0 ? [text.shutdownCount(closed)] : []),
    ...failures.map((failure) => `${failure.id}: ${failureText(failure.code)}`),
  ].join('；')
}

/** How a sidebar row names itself in the injected button's tooltip. */
function rowName(group: RowGroup): string {
  if (group.workspaceId === undefined) return text.ungrouped
  return group.label.length > 0 ? group.label : text.untitledWorkspace
}

/** Prose for the bulk-archive button injected into each sidebar row. */
export const rowCopy: RowButtonCopy = {
  action: (group) => `归档「${rowName(group)}」中的 ${String(group.sessionCount)} 个会话`,
  empty: (group) => `「${rowName(group)}」没有可归档的会话`,
  busy: text.archiving,
}

/** Render one bulk-archive result as a single line. */
export function bulkArchiveSummary(result: BulkArchiveResult): string {
  if (result.refusal !== undefined) return refusalText(result.refusal.code)
  if (result.archived.length === 0 && result.failed.length === 0) return text.nothingToArchive
  const reasons = [...new Set(result.skipped.map((skip) => skipText(skip.reason)))].join('、')
  return [
    text.archivedCount(result.archived.length),
    ...(result.skipped.length > 0 ? [`${text.skippedCount(result.skipped.length)}（${reasons}）`] : []),
    ...result.failed.map((outcome) => `${outcome.id}: ${failureText(outcome.code)}`),
  ].join('；')
}

/**
 * Why one session-scoped operation failed.
 *
 * Two groups need to say more than "it failed". The `ownership-*` codes are
 * the refusals that guard a path this plugin composed itself, so each names
 * the expectation that broke — a user who sees them should be able to tell a
 * mis-derived path from a directory that was never a session log. The last
 * two report a delete that already removed the log: naming what did *not*
 * happen afterwards is the difference between a retry that helps and one that
 * looks for a file that is already gone.
 */
const FAILURE_TEXT: Readonly<Record<FailureCode, string>> = {
  'capability-disabled': '该能力在当前 DSH 版本上不可用',
  'invalid-session-id': '会话 id 不合法',
  'not-archived': '会话不在归档集合中',
  'archive-set-unreadable': '无法读取归档集合，已放弃写入',
  'unknown-session': '宿主找不到这个会话',
  'teardown-effect-missing': '无法确认会话已停止，已放弃操作',
  'write-lease-held': '会话的写句柄仍被占用',
  'log-root-unknown': '无法确定会话日志根目录，旧格式日志无法定位',
  'legacy-log-not-found': '后端不提供该会话的日志路径，日志根目录下也没有对应目录',
  'log-path-refused': '日志路径未通过安全校验',
  'ownership-basename-mismatch': '推导出的目录名与会话 id 不一致，已放弃删除',
  'ownership-generation-missing': '推导出的目录里没有会话日志文件，已放弃删除',
  'ownership-outside-root': '推导出的目录不在会话日志根目录之内，已放弃删除',
  'ownership-unsafe-root': '推导出的目录形状不安全，已放弃删除',
  'remove-failed': '删除文件失败',
  'ledger-detach-failed': '日志已删除，但会话未能从原工作区移除；它仍留在归档区，可重试删除',
  'archive-set-stale': '日志已删除、会话也已脱离工作区，但归档区未更新；刷新后重试删除',
  'host-error': '宿主返回了未预期的错误',
}

/** Turn a failure code into a sentence. */
export function failureText(code: FailureCode): string {
  return FAILURE_TEXT[code] ?? code
}

/**
 * Why a call never produced a host answer.
 *
 * These four are the transport's own codes, not a host verdict, and they used
 * to reach the user as the raw code string. They are dictionary entries like
 * everything else; the underlying message follows in parentheses because it is
 * the only part that says *which* route or *which* profile was at fault.
 */
const TRANSPORT_TEXT: Readonly<Record<TransportFailureCode, string>> = {
  'session-archive/bad-request': '请求不被宿主接受',
  'session-archive/handler-failed': '宿主处理请求时出错',
  'session-archive/no-connection': '当前 profile 没有加载连接服务',
  'session-archive/transport': '与宿主通信失败',
}

/** Turn a failed call into a sentence. */
export function callFailureText(outcome: Extract<CallOutcome<unknown>, { ok: false }>): string {
  const reason = TRANSPORT_TEXT[outcome.code] ?? outcome.code
  return outcome.message.length > 0 ? `${reason}（${outcome.message}）` : reason
}

/** Why a whole bulk archive was refused. */
const REFUSAL_TEXT: Readonly<Record<BulkRefusalCode, string>> = {
  'capability-disabled': '归档能力在当前 DSH 版本上不可用',
  'unknown-scope': text.unknownWorkspace,
  'catalog-unreadable': '读不出会话目录，无法确定这一行有哪些会话，未做任何改动',
}

/** Turn a bulk-refusal code into a sentence. */
export function refusalText(code: BulkRefusalCode): string {
  return REFUSAL_TEXT[code] ?? code
}

/** Why a capability is switched off. */
const BLOCK_TEXT: Readonly<Record<CapabilityBlockCode, string>> = {
  'workspace-registry-unavailable': '工作区注册表不可用',
  'archive-api-missing': '宿主的归档接口已改变',
  'private-write-path-missing': '宿主的归档集合写入通路已改变',
  'workspace-domain-unavailable': '工作区存储域未打开',
  'fiber-scan-unavailable': '无法遍历 Cordis 的插件树',
  'agent-roots-unavailable': '无法区分顶层 agent 与子代理，关闭会话已停用',
  'persistence-backend-unsupported': '当前持久化后端不支持删除',
  'log-resolver-missing': '后端不再提供日志路径',
  'log-root-unknown': '无法确定会话日志根目录',
  'projection-cache-unavailable': '会话投影缓存不可用',
  'session-list-unavailable': '无法读取会话列表',
  'probe-failed': '能力探测本身失败',
}

/** Turn a capability block code into a sentence. */
export function blockText(code: CapabilityBlockCode): string {
  return BLOCK_TEXT[code] ?? code
}

/** Why bulk archive left a session alone. */
const SKIP_TEXT: Readonly<Record<ArchiveSkipReason, string>> = {
  subagent: '子代理会话本就不在侧栏显示',
  'already-archived': '已经归档',
  blank: '空会话不归档',
}

/** Turn a bulk-archive skip reason into a sentence. */
export function skipText(reason: ArchiveSkipReason): string {
  return SKIP_TEXT[reason] ?? reason
}

/** Relative-time words, keyed by the primitive's bucket. */
const RELATIVE_UNIT: Readonly<Record<string, (n: number) => string>> = {
  now: () => '刚刚',
  minutes: (n) => `${String(n)} 分钟前`,
  hours: (n) => `${String(n)} 小时前`,
  days: (n) => `${String(n)} 天前`,
  months: (n) => `${String(n)} 个月前`,
  years: (n) => `${String(n)} 年前`,
}

/** Localize the shared relative-time bucket so two surfaces date a session alike. */
export function relativeText(bucket: { unit: string; n: number }): string {
  return (RELATIVE_UNIT[bucket.unit] ?? ((n: number) => `${String(n)}`))(bucket.n)
}
