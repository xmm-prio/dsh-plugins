/**
 * Browser half of the session archive plugin.
 *
 * Three surfaces. The archive area goes into the host's own
 * `sidebar.footer.action` slot and the per-session shutdown button into
 * `conversation.session.header.utilities`, so nothing about the sidebar or
 * the conversation header is patched to get either. The per-row bulk-archive
 * button has no slot to go into — the built-in workspace browser exposes none
 * anywhere near a row — and is injected into the row's action strip instead,
 * behind the kill-switch in `sidebar/`.
 *
 * @module @dsh-plugins/session-archive/client
 */

import type { Context } from '@deepseek-ai/cordis'

import { createArchivePanel } from './panel/ArchivePanel.js'
import { createSessionShutdown } from './shutdown/SessionShutdown.js'
import { installSidebarButtons } from './sidebar/install.js'
import { text } from './text.js'
import { createArchiveApi } from './transport/archive-api.js'

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
  const SessionShutdown = createSessionShutdown(ctx)

  // `inject`/`register` are prototype methods, so the service proxy binds
  // `this.ctx` to this caller: the effect lands on this plugin's own fiber and
  // unload removes the entry. No manual disposer is needed.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'session-archive', order: 400, label: () => text.entryLabel },
      ArchivePanel,
    ),
  )

  // Last in the utilities strip: this is the one control there that ends
  // something, and it must not sit where a user reaches for the ones that do
  // not. `inject` also means a profile without the conversation UI simply
  // never registers it, rather than failing.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'session-archive-shutdown', order: 800 },
      SessionShutdown,
    ),
  )

  installSidebarButtons(ctx, createArchiveApi(ctx))
}
