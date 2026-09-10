/**
 * Browser half of the session archive plugin.
 *
 * One registration, into the host's own `sidebar.footer.action` slot. Nothing
 * about the built-in sidebar is patched, shadowed, or reached into.
 *
 * @module @dsh-plugins/session-archive/client
 */

import type { Context } from '@deepseek-ai/cordis'

import { createArchivePanel } from './panel/ArchivePanel.js'
import { text } from './text.js'

export const name = 'session-archive-client'

/**
 * `slots` is the only hard dependency.
 *
 * `connection` is deliberately absent: it is read with `ctx.get` when a call is
 * actually made, so a profile that mounts the slots service but not the
 * connection still shows the entry point with an explanatory failure instead of
 * silently never activating. A misspelling in this array produces exactly that
 * silence, with no error anywhere.
 */
export const inject = ['slots'] as const

/**
 * Mount the browser half.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  const ArchivePanel = createArchivePanel(ctx)

  // `inject`/`register` are prototype methods, so the service proxy binds
  // `this.ctx` to this caller: the effect lands on this plugin's own fiber and
  // unload removes the entry. No manual disposer is needed.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'session-archive', order: 400, label: () => text.entryLabel },
      ArchivePanel,
    ),
  )
}
