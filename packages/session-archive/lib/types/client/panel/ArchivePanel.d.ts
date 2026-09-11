/**
 * The archive area: the sidebar footer entry and the modal it opens.
 *
 * Registered into `sidebar.footer.action`, which is the host's own extension
 * point for exactly this, so nothing about the built-in sidebar is patched.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Props the slot owner supplies to a footer action. */
export interface FooterActionProps {
    /** Whether the sidebar is expanded; collapsed rows show the icon only. */
    readonly wide?: boolean;
}
/** The sidebar footer entry, and the archive area it opens. */
export declare function createArchivePanel(ctx: Context): (props: FooterActionProps) => JSX.Element;
