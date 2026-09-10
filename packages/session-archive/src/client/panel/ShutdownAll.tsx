/**
 * Stop every running agent, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * Shutdown-all has no such row to belong to, so it stays here.
 */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useState } from 'react'

import { callFailureText, text } from '../text.js'
import type { ArchiveApi } from '../transport/archive-api.js'

/** The shutdown-all action and the line it reports into. */
export function ShutdownAll({ api, enabled }: { api: ArchiveApi; enabled: boolean }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)

  const shutdown = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const outcome = await api.shutdownAll({})
    setBusy(false)
    if (!outcome.ok) {
      setMessage(callFailureText(outcome))
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
  }, [api, busy])

  return (
    <section>
      <Button variant="outline" size="sm" disabled={busy || !enabled} onClick={() => void shutdown()}>
        {text.shutdownAll}
      </Button>
      {message === undefined ? null : <p>{message}</p>}
    </section>
  )
}
