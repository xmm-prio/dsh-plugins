/**
 * The shutdown confirmation's stylesheet, and the single place its class
 * names are written down on the JavaScript side.
 *
 * The sheet is global rather than a CSS module, so renaming one of these
 * means renaming it in both files — this map is the reminder of where.
 */

import { installStylesheet } from '../stylesheet.js'
import css from './shutdown.css'

/** Class names, shared between `shutdown.css` and the JSX beside it. */
export const cls = {
  list: 'dsh-shutdown-list',
  row: 'dsh-shutdown-row',
  name: 'dsh-shutdown-name',
  note: 'dsh-shutdown-note',
} as const

installStylesheet('@dsh-plugins/session-archive/shutdown', css)
