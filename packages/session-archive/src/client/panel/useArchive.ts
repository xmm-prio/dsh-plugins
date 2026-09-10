/**
 * All archive-area state in one hook.
 *
 * The panel below is then a pure rendering of this state, which is what keeps
 * the "which sessions are selected / what did the last operation report" logic
 * out of the JSX and testable in isolation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ArchiveListResult, CapabilitiesResult, OperationOutcome } from '../../contract.js'
import type { ArchiveApi, CallOutcome } from '../transport/archive-api.js'

/** What the last completed operation reported, ready to render as one line. */
export interface OperationReport {
  readonly kind: 'ok' | 'partial' | 'failed'
  readonly message: string
  readonly failures: readonly Extract<OperationOutcome, { ok: false }>[]
}

/** Everything the panel renders and every action it offers. */
export interface ArchiveState {
  readonly api: ArchiveApi
  readonly loading: boolean
  readonly listing: ArchiveListResult | undefined
  readonly capabilities: CapabilitiesResult | undefined
  readonly loadError: string | undefined
  readonly selected: ReadonlySet<string>
  readonly busy: boolean
  readonly report: OperationReport | undefined
  toggle(id: string): void
  /**
   * Select exactly these ids, on top of whatever is already selected.
   *
   * The caller says what "all" means, because only the caller knows whether a
   * search box is narrowing the list — and a select-all that reached rows the
   * user cannot see would aim a delete at them.
   */
  selectAll(ids: readonly string[]): void
  clearSelection(): void
  reload(): void
  unarchive(): Promise<void>
  remove(): Promise<void>
}

/** The prose this hook needs; supplied by the caller so no strings live here. */
export interface ArchiveCopy {
  /** Renders one per-session failure. */
  describe(outcome: Extract<OperationOutcome, { ok: false }>): string
  /** Renders a failure that stopped the call before the host answered. */
  transport(outcome: Extract<CallOutcome<unknown>, { ok: false }>): string
  /** Renders "n sessions unarchived". */
  unarchived(count: number): string
  /** Renders "n sessions deleted". */
  deleted(count: number): string
}

/**
 * Drive the archive area.
 * @param api - the bound endpoint set.
 * @param open - whether the panel is showing; closing it drops the selection.
 * @param copy - the strings this hook composes reports out of.
 * @returns the panel's complete state and actions.
 */
export function useArchive(api: ArchiveApi, open: boolean, copy: ArchiveCopy): ArchiveState {
  const { describe, transport, unarchived: unarchivedText, deleted: deletedText } = copy
  const [loading, setLoading] = useState(false)
  const [listing, setListing] = useState<ArchiveListResult | undefined>(undefined)
  const [capabilities, setCapabilities] = useState<CapabilitiesResult | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<OperationReport | undefined>(undefined)
  const [generation, setGeneration] = useState(0)

  const reload = useCallback(() => {
    setGeneration((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError(undefined)
    void (async () => {
      const [capability, list] = await Promise.all([
        api.capabilities({}, controller.signal),
        api.list({}, controller.signal),
      ])
      if (controller.signal.aborted) return
      if (capability.ok) setCapabilities(capability.value)
      if (list.ok) {
        setListing(list.value)
        // Drop ids that are no longer archived, so a stale selection can never
        // aim an operation at a row the user cannot see.
        const present = new Set(list.value.entries.map((entry) => entry.id))
        setSelected((current) => new Set([...current].filter((id) => present.has(id))))
      } else {
        setLoadError(transport(list))
      }
      setLoading(false)
    })()
    return () => {
      controller.abort()
    }
  }, [api, open, generation, transport])

  useEffect(() => {
    if (open) return
    setSelected(new Set())
    setReport(undefined)
  }, [open])

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: readonly string[]) => {
    setSelected((current) => new Set([...current, ...ids]))
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  const run = useCallback(
    async (
      operation: (ids: readonly string[]) => Promise<CallOutcome<{ outcomes: readonly OperationOutcome[] }>>,
      succeeded: (count: number) => string,
    ) => {
      const ids = [...selected]
      if (ids.length === 0 || busy) return
      setBusy(true)
      const outcome = await operation(ids)
      setBusy(false)
      if (!outcome.ok) {
        setReport({ kind: 'failed', message: transport(outcome), failures: [] })
        return
      }
      const failures = outcome.value.outcomes.filter(
        (item): item is Extract<OperationOutcome, { ok: false }> => !item.ok,
      )
      const done = outcome.value.outcomes.length - failures.length
      setReport({
        kind: failures.length === 0 ? 'ok' : done === 0 ? 'failed' : 'partial',
        message: [...(done > 0 ? [succeeded(done)] : []), ...failures.map(describe)].join('；'),
        failures,
      })
      // Re-read rather than patching the local list: the host is the only
      // authority on what is archived, and a delete also changes workspaces.
      reload()
    },
    [busy, describe, reload, selected, transport],
  )

  const unarchive = useCallback(async () => {
    await run((ids) => api.unarchive({ ids }), unarchivedText)
  }, [api, run, unarchivedText])

  const remove = useCallback(async () => {
    await run((ids) => api.delete({ ids }), deletedText)
  }, [api, run, deletedText])

  return useMemo(
    () => ({
      api,
      loading,
      listing,
      capabilities,
      loadError,
      selected,
      busy,
      report,
      toggle,
      selectAll,
      clearSelection,
      reload,
      unarchive,
      remove,
    }),
    [
      api,
      busy,
      capabilities,
      clearSelection,
      listing,
      loadError,
      loading,
      reload,
      remove,
      report,
      selectAll,
      selected,
      toggle,
      unarchive,
    ],
  )
}
