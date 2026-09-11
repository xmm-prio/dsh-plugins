/**
 * Stop every running agent, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * Shutdown-all has no such row to belong to, so it stays here.
 *
 * It reports through `onReport` rather than rendering its own line: the panel
 * shows one status at a time, and two components writing two lines would let
 * the user read an answer to a question they had already moved on from.
 */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { callFailureText, text } from '../text.js'
import type { ArchiveApi } from '../transport/archive-api.js'

/** The shutdown-all action, as a toolbar button. */
export function ShutdownAll({
  api,
  enabled,
  icon,
  onReport,
}: {
  api: ArchiveApi
  enabled: boolean
  /** Rendered inside the button; the label lives in the tooltip. */
  icon: ReactNode
  /** Hands the outcome to whoever owns the panel's status line. */
  onReport: (message: string) => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)

  const shutdown = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const outcome = await api.shutdownAll({})
    setBusy(false)
    if (!outcome.ok) {
      onReport(callFailureText(outcome))
      return
    }
    const failures = outcome.value.outcomes.filter((item) => !item.ok)
    onReport(
      outcome.value.outcomes.length === 0
        ? text.nothingRunning
        : [
            text.shutdownCount(outcome.value.outcomes.length - failures.length),
            ...(failures.length > 0 ? [text.partialFailure(failures.length)] : []),
          ].join('；'),
    )
  }, [api, busy, onReport])

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={icon}
      aria-label={text.shutdownAll}
      title={text.shutdownAll}
      disabled={busy || !enabled}
      onClick={() => void shutdown()}
    />
  )
}
