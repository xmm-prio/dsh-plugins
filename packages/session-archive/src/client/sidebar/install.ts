/**
 * Browser wiring for the injected sidebar row buttons.
 *
 * Everything environmental lives here — the mutation observer, the hover
 * refresh, the capability probe, and the unload teardown — so `row-buttons`
 * stays a lifecycle over an adapter and `adapter` stays pure recognition.
 */

import type { Context } from '@deepseek-ai/cordis'

import type { RowGroup } from './adapter.js'
import { createRowButtons } from './row-buttons.js'
import type { RowButtons } from './row-buttons.js'
import { blockText, bulkArchiveSummary, callFailureText, rowCopy } from '../text.js'
import type { ArchiveApi } from '../transport/archive-api.js'

/**
 * Floor between full scans.
 *
 * The observer watches the whole document because the sidebar's own container
 * unmounts with it, and a chat UI mutates constantly. Coalescing to one scan
 * per interval keeps a document-wide query off the streaming path.
 */
const SCAN_INTERVAL_MS = 150

/** Ask the host why bulk archive is off, if it is. */
async function archiveBlockReason(api: ArchiveApi): Promise<string | undefined> {
  const outcome = await api.capabilities({})
  // A probe that cannot be reached is not a refusal: leave the button live and
  // let the host answer for itself, which reports a far more precise reason.
  if (!outcome.ok) return undefined
  const status = outcome.value.capabilities.archive
  return status.available ? undefined : blockText(status.code ?? 'probe-failed')
}

/**
 * Inject and maintain a bulk-archive button on every sidebar row.
 *
 * @param ctx - the browser plugin context; unload removes every injected node.
 * @param api - the host endpoints.
 */
export function installSidebarButtons(ctx: Context, api: ArchiveApi): void {
  ctx.effect(() => {
    let disposed = false
    let buttons: RowButtons | undefined
    const teardown: (() => void)[] = []

    void (async () => {
      const blocked = await archiveBlockReason(api).catch(() => undefined)
      if (disposed) return

      buttons = createRowButtons({
        root: document,
        archive: async (group: RowGroup) => {
          const outcome =
            group.workspaceId === undefined
              ? await api.archiveUngrouped({})
              : await api.archiveWorkspace({ workspaceId: group.workspaceId })
          return outcome.ok ? bulkArchiveSummary(outcome.value) : callFailureText(outcome)
        },
        blocked,
        copy: rowCopy,
        warn: (message) => {
          console.warn(message)
        },
      })

      let pending: ReturnType<typeof setTimeout> | undefined
      const schedule = (): void => {
        if (pending !== undefined || disposed) return
        pending = setTimeout(() => {
          pending = undefined
          buttons?.sync()
        }, SCAN_INTERVAL_MS)
      }

      // Only structural changes can add or remove a row; attribute and text
      // churn from a streaming conversation must not trigger a scan.
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.addedNodes.length > 0 || record.removedNodes.length > 0) return schedule()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      // A collapsed row can change its session count without changing its DOM,
      // and the buttons are only visible while the row is hovered anyway.
      document.addEventListener('pointerover', schedule, { passive: true })

      teardown.push(() => {
        observer.disconnect()
        document.removeEventListener('pointerover', schedule)
        if (pending !== undefined) clearTimeout(pending)
      })
      buttons.sync()
    })()

    return () => {
      disposed = true
      for (const dispose of teardown.splice(0)) dispose()
      buttons?.dispose()
    }
  }, 'session-archive: sidebar row buttons')
}
