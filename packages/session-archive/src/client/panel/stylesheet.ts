/**
 * The panel's stylesheet, and the single place its class names are written
 * down on the JavaScript side.
 *
 * The alternative, inline `style` objects on every element, cannot express
 * `:hover`, `::-webkit-scrollbar`, or `position: sticky` backgrounds, and
 * would put the panel's looks in a dozen places instead of one.
 */

import { installStylesheet } from '../stylesheet.js'
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

installStylesheet('@dsh-plugins/session-archive/panel', css)
