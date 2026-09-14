/**
 * Release what is running in the background, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * This action has no such row to belong to, so it stays here.
 *
 * The session the user is currently looking at is left alone. The action
 * exists to free background resources, and the foreground session is not one
 * of them — it is also the one whose teardown a user would least expect from
 * a button in another panel. Its own header carries the button that closes it.
 *
 * It reports through `onReport` rather than rendering its own line: the panel
 * shows one status at a time, and two components writing two lines would let
 * the user read an answer to a question they had already moved on from.
 */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { ShutdownConfirmation } from '../shutdown/ShutdownConfirmation.js'
import { backgroundTargets } from '../shutdown/targets.js'
import { useShutdown } from '../shutdown/useShutdown.js'
import type { ShutdownPlan, ShutdownReport } from '../shutdown/useShutdown.js'
import { callFailureText, catalogUnreadableText, shutdownReport, text } from '../text.js'
import type { ArchiveApi } from '../transport/archive-api.js'

/** How this button reports, which is the same vocabulary the header uses. */
const copy = {
  nothing: text.nothingRunning,
  report: shutdownReport,
  transport: callFailureText,
}

/** The background-shutdown action, as a toolbar button. */
export function ShutdownAll({
  api,
  enabled,
  icon,
  currentSessionId,
  onReport,
}: {
  api: ArchiveApi
  enabled: boolean
  /** Rendered inside the button; the label lives in the tooltip. */
  icon: ReactNode
  /** The session the browser is showing, which is never a target. */
  currentSessionId: string | undefined
  /** Hands the outcome to whoever owns the panel's status line. */
  onReport: (message: string) => void
}): JSX.Element {
  const collect = useCallback(async (): Promise<ShutdownPlan> => {
    const outcome = await api.running({})
    if (!outcome.ok) return { kind: 'refused', message: callFailureText(outcome) }
    // A catalog that could not be read costs the titles, not the ids. Showing
    // a list of bare ids is worse than not offering the action at all, since
    // a confirmation nobody can check is not a confirmation.
    if (outcome.value.catalogError !== undefined) {
      return { kind: 'refused', message: catalogUnreadableText(outcome.value.catalogError) }
    }
    return { kind: 'targets', targets: backgroundTargets(outcome.value.sessions, currentSessionId) }
  }, [api, currentSessionId])

  // The panel's status line shows successes and failures alike; it is the
  // only feedback this button has, since the rows it closed are not on screen.
  const report = useCallback((outcome: ShutdownReport) => {
    onReport(outcome.message)
  }, [onReport])

  const flow = useShutdown(api, collect, copy, report)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={icon}
        aria-label={text.shutdownAll}
        title={text.shutdownAll}
        disabled={flow.busy || !enabled}
        onClick={flow.start}
      />
      <ShutdownConfirmation flow={flow} title={text.shutdownTitle} note={text.shutdownCurrentExcluded} />
    </>
  )
}
