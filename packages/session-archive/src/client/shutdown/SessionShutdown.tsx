/**
 * Close one session's agent, from that session's own header.
 *
 * DSH has no way to stop a single agent: opening a session in the web UI
 * resumes it, and it then stays alive until the process exits. The archive
 * area's bulk action releases what is running in the *background*, which by
 * construction excludes the session in front of you — so the only place the
 * current one can be closed from is here.
 *
 * Registered into `conversation.session.header.utilities`, a public slot with
 * `scope: 'session'`, so `sessionId` arrives as a standard prop and nothing
 * about the header is patched.
 *
 * Closing a parent closes its subagents too: the host's own `scope.dispose()`
 * cascades into every child agent the session created, so "close this
 * session's agents" is this one call rather than a traversal.
 */

import { Button, IconStopFill16, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'

import { callFailureText, shutdownReport, text } from '../text.js'
import { createArchiveApi } from '../transport/archive-api.js'
import { ShutdownConfirmation } from './ShutdownConfirmation.js'
import { useRunningAgent } from './useRunningAgent.js'
import { useShutdown } from './useShutdown.js'
import type { ShutdownPlan, ShutdownReport } from './useShutdown.js'

/** The standard props a session-scoped slot occupant receives. */
export interface SessionHeaderProps {
  readonly sessionId: string
  /** Session list and current selection; the source of the `running` bit. */
  readonly useSessions: <T>(selector: (state: SessionListSnapshot) => T) => T
}

/** The slice of the session list this component reads. */
interface SessionListSnapshot {
  readonly byId: Readonly<Record<string, { readonly running: boolean; readonly displayTitle: string } | undefined>>
}

/** How this button reports, which is the same vocabulary the panel uses. */
const copy = {
  nothing: text.sessionNotRunning,
  report: shutdownReport,
  transport: callFailureText,
}

/**
 * Build the header button bound to one plugin context.
 * @param ctx - the browser plugin context.
 * @returns the slot component.
 */
export function createSessionShutdown(ctx: Context): (props: SessionHeaderProps) => JSX.Element | null {
  const api = createArchiveApi(ctx)

  return function SessionShutdown({ sessionId, useSessions }: SessionHeaderProps): JSX.Element | null {
    const summary = useSessions((state) => state.byId[sessionId])
    const [failure, setFailure] = useState<string | undefined>(undefined)
    const [epoch, setEpoch] = useState(0)

    const collect = useCallback(
      async (): Promise<ShutdownPlan> => ({
        kind: 'targets',
        targets: [{ id: sessionId, label: summary?.displayTitle ?? text.untitledSession }],
      }),
      [sessionId, summary?.displayTitle],
    )

    // A success needs no banner: the button is gone on the next probe, and
    // that absence is the report. Anything else has to be said out loud,
    // because the button staying put is otherwise indistinguishable from
    // nothing having been clicked.
    const report = useCallback((outcome: ShutdownReport) => {
      setFailure(outcome.ok ? undefined : outcome.message)
      setEpoch((previous) => previous + 1)
    }, [])

    const flow = useShutdown(api, collect, copy, report)
    const live = useRunningAgent(api, sessionId, summary?.running === true, epoch)

    // Nothing to stop, nothing to offer. The utilities strip is shared with
    // the host's own controls, and a permanently disabled button in it would
    // read as something broken rather than something inapplicable.
    if (!live && flow.pending === undefined) return null

    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconStopFill16 size={14} />}
          aria-label={text.shutdownSession}
          title={text.shutdownSession}
          disabled={flow.busy}
          onClick={flow.start}
        />
        <ShutdownConfirmation flow={flow} title={text.shutdownSessionTitle} note={text.shutdownSessionNote} />
        {failure === undefined ? null : (
          <Toast
            text={failure}
            holdMs={6_000}
            onDone={() => {
              setFailure(undefined)
            }}
          />
        )}
      </>
    )
  }
}
