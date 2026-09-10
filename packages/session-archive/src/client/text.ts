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

import type { BulkRefusalCode, CapabilityBlockCode, FailureCode } from '../contract.js'
import type { ArchiveSkipReason } from '../domain/grouping.js'

export const text = {
  /** Sidebar footer entry and the panel it opens. */
  entryLabel: '归档区',
  panelTitle: '归档区',
  panelDescription: '已归档的会话不在侧栏显示。取消归档即可让它重新出现，删除会永久移除它的日志。',
  close: '关闭',

  /** Row-level chrome. */
  untitled: '未命名会话',
  ungrouped: '未分组',
  workspaceColumn: '原工作区',
  createdAt: '创建于',
  lastActivityAt: '最近活动',
  size: '日志大小',
  unknownSize: '未知',

  /** Actions. */
  unarchive: '取消归档',
  deleteAction: '删除',
  selectAll: '全选',
  clearSelection: '取消选择',
  refresh: '刷新',
  shutdownAll: '关闭所有运行中会话',
  archiveWorkspaceAll: '全部归档',

  /** Empty, loading, and failure states. */
  loading: '正在读取归档区…',
  empty: '归档区是空的。',
  loadFailed: '读取归档区失败',
  retry: '重试',

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
  archivedCount: (n: number) => `已归档 ${String(n)} 个会话`,
  unarchivedCount: (n: number) => `已取消归档 ${String(n)} 个会话`,
  deletedCount: (n: number) => `已删除 ${String(n)} 个会话的日志`,
  skippedCount: (n: number) => `跳过 ${String(n)} 个`,
  shutdownCount: (n: number) => `已关闭 ${String(n)} 个运行中会话`,
  nothingToArchive: '这一行没有可归档的会话。',
  nothingRunning: '当前没有运行中的会话。',
  unknownWorkspace: '该工作区已不存在。',
  partialFailure: (n: number) => `${String(n)} 个操作未成功`,
} as const

/** Delete-confirmation body text, which names exactly what is about to happen. */
export function deleteDescription(count: number): string {
  return `即将永久删除 ${String(count)} 个会话的日志文件。这些会话会先被停止，随后从归档区和原工作区一并移除。此操作不可撤销。`
}

/** Why one session-scoped operation failed. */
const FAILURE_TEXT: Readonly<Record<FailureCode, string>> = {
  'capability-disabled': '该能力在当前 DSH 版本上不可用',
  'invalid-session-id': '会话 id 不合法',
  'not-archived': '会话不在归档集合中',
  'archive-set-unreadable': '无法读取归档集合，已放弃写入',
  'unknown-session': '宿主找不到这个会话',
  'teardown-effect-missing': '无法确认会话已停止，已放弃操作',
  'write-lease-held': '会话的写句柄仍被占用',
  'legacy-log-format': '日志使用较旧的格式版本，后端不提供其路径',
  'log-path-refused': '日志路径未通过安全校验',
  'remove-failed': '删除文件失败',
  'host-error': '宿主返回了未预期的错误',
}

/** Turn a failure code into a sentence. */
export function failureText(code: FailureCode): string {
  return FAILURE_TEXT[code] ?? code
}

/** Why a whole bulk archive was refused. */
const REFUSAL_TEXT: Readonly<Record<BulkRefusalCode, string>> = {
  'capability-disabled': '归档能力在当前 DSH 版本上不可用',
  'unknown-scope': text.unknownWorkspace,
}

/** Turn a bulk-refusal code into a sentence. */
export function refusalText(code: BulkRefusalCode): string {
  return REFUSAL_TEXT[code] ?? code
}

/** Why a capability is switched off. */
const BLOCK_TEXT: Readonly<Record<CapabilityBlockCode, string>> = {
  'workspace-registry-unavailable': '工作区注册表不可用',
  'archive-api-missing': '宿主的归档接口已改变',
  'enqueue-operation-missing': '宿主的写入队列已改变',
  'registry-state-missing': '宿主的注册表状态已改变',
  'workspace-domain-unavailable': '工作区存储域未打开',
  'fiber-scan-unavailable': '无法遍历 Cordis 的插件树',
  'persistence-backend-unsupported': '当前持久化后端不支持删除',
  'log-resolver-missing': '后端不再提供日志路径',
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
