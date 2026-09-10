/**
 * Bulk archive, and the shutdown-all action.
 *
 * These live inside this plugin's own panel rather than as buttons injected
 * into the built-in sidebar's rows. Injecting into a row means reading a React
 * fiber for the row's group identity and grafting a node into a subtree React
 * owns, and neither of those could be verified on this machine — there is no
 * browser here. Both actions work identically from here, with no coupling to
 * the built-in sidebar's DOM at all.
 */

import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState } from 'react'

import type { ArchivableGroup, BulkArchiveResult } from '../../contract.js'
import { failureText, refusalText, skipText, text } from '../text.js'
import type { ArchiveApi } from '../transport/archive-api.js'

/** Render one bulk-archive result as a single line. */
function describeBulk(result: BulkArchiveResult): string {
  if (result.refusal !== undefined) return refusalText(result.refusal.code)
  if (result.archived.length === 0 && result.failed.length === 0) return text.nothingToArchive
  return [
    text.archivedCount(result.archived.length),
    ...(result.skipped.length > 0
      ? [`${text.skippedCount(result.skipped.length)}（${uniqueReasons(result)}）`]
      : []),
    ...result.failed.map((outcome) => `${outcome.id}: ${failureText(outcome.code)}`),
  ].join('；')
}

function uniqueReasons(result: BulkArchiveResult): string {
  return [...new Set(result.skipped.map((skip) => skipText(skip.reason)))].join('、')
}

/** Bulk archive per sidebar row, and one shutdown-all button. */
export function BulkActions({
  api,
  open,
  canArchive,
  canShutdown,
  onChanged,
}: {
  api: ArchiveApi
  open: boolean
  canArchive: boolean
  canShutdown: boolean
  onChanged: () => void
}): JSX.Element | null {
  const [groups, setGroups] = useState<readonly ArchivableGroup[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void (async () => {
      const outcome = await api.groups({}, controller.signal)
      if (controller.signal.aborted) return
      setGroups(outcome.ok ? outcome.value.groups : [])
      if (!outcome.ok) setMessage(`${outcome.code}: ${outcome.message}`)
    })()
    return () => {
      controller.abort()
    }
  }, [api, open, generation])

  const archive = useCallback(
    async (group: ArchivableGroup) => {
      if (busy) return
      setBusy(true)
      const outcome =
        group.workspaceId === undefined
          ? await api.archiveUngrouped({})
          : await api.archiveWorkspace({ workspaceId: group.workspaceId })
      setBusy(false)
      setMessage(outcome.ok ? describeBulk(outcome.value) : `${outcome.code}: ${outcome.message}`)
      setGeneration((value) => value + 1)
      onChanged()
    },
    [api, busy, onChanged],
  )

  const shutdown = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const outcome = await api.shutdownAll({})
    setBusy(false)
    if (!outcome.ok) {
      setMessage(`${outcome.code}: ${outcome.message}`)
      return
    }
    const failures = outcome.value.outcomes.filter((item) => !item.ok)
    setMessage(
      outcome.value.outcomes.length === 0
        ? text.nothingRunning
        : [
            text.shutdownCount(outcome.value.outcomes.length - failures.length),
            ...(failures.length > 0 ? [text.partialFailure(failures.length)] : []),
          ].join('；'),
    )
    setGeneration((value) => value + 1)
  }, [api, busy])

  if (groups === undefined) return null

  return (
    <section>
      <ul>
        {groups.map((group) => (
          <li key={group.workspaceId ?? '\u0000ungrouped'}>
            <Tag tone={group.workspaceId === undefined ? 'quiet' : 'outline'}>
              {group.title ?? text.ungrouped}
            </Tag>
            <span>{String(group.visibleCount)}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !canArchive || group.archivableCount === 0}
              onClick={() => void archive(group)}
            >
              {text.archiveWorkspaceAll}
              {group.archivableCount === 0 ? '' : `（${String(group.archivableCount)}）`}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" disabled={busy || !canShutdown} onClick={() => void shutdown()}>
        {text.shutdownAll}
      </Button>
      {message === undefined ? null : <p>{message}</p>}
    </section>
  )
}
