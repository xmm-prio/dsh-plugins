/**
 * The panel's stylesheet, and the single place its class names are written
 * down on the JavaScript side.
 *
 * DSH's client module loader claims every untagged `<style>` element for the
 * plugin whose factory just ran, and drops them again when that plugin
 * unloads. Appending the tag here — at module scope, with no `data-plugin`
 * attribute of our own — is therefore all it takes to get the same lifecycle
 * the first-party packages get: the CSS arrives with the bundle and leaves
 * with it. `data-plugin-css` only names the sheet in the loader's bookkeeping.
 *
 * The alternative, inline `style` objects on every element, cannot express
 * `:hover`, `::-webkit-scrollbar`, or `position: sticky` backgrounds, and
 * would put the panel's looks in a dozen places instead of one.
 */

import css from './panel.css'

/**
 * Class names, shared between `panel.css` and the JSX below it.
 *
 * The stylesheet is global rather than a CSS module, so renaming one of these
 * means renaming it in both files — this map is the reminder of where.
 */
export const cls = {
  panel: 'dsh-archive-panel',
  head: 'dsh-archive-head',
  heading: 'dsh-archive-heading',
  title: 'dsh-archive-title',
  subtitle: 'dsh-archive-subtitle',
  close: 'dsh-archive-close',
  toolbar: 'dsh-archive-toolbar',
  search: 'dsh-archive-search',
  list: 'dsh-archive-list',
  group: 'dsh-archive-group',
  groupHead: 'dsh-archive-group-head',
  groupIcon: 'dsh-archive-group-icon',
  groupName: 'dsh-archive-group-name',
  groupCount: 'dsh-archive-group-count',
  rows: 'dsh-archive-rows',
  row: 'dsh-archive-row',
  rowLabel: 'dsh-archive-row-label',
  check: 'dsh-archive-check',
  rowTitle: 'dsh-archive-row-title',
  rowMeta: 'dsh-archive-row-meta',
  separator: 'dsh-archive-sep',
  notices: 'dsh-archive-notices',
  notice: 'dsh-archive-notice',
  noticeSubject: 'dsh-archive-notice-subject',
  status: 'dsh-archive-status',
  empty: 'dsh-archive-empty',
  foot: 'dsh-archive-foot',
  footInfo: 'dsh-archive-foot-info',
  provenance: 'dsh-archive-provenance',
} as const

if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.setAttribute('data-plugin-css', '@dsh-plugins/session-archive/panel')
  style.textContent = css
  document.head.append(style)
}
