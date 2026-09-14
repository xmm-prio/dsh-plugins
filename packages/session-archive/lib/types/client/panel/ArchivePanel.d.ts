/**
 * The archive area: the sidebar footer entry and the modal it opens.
 *
 * Registered into `sidebar.footer.action`, which is the host's own extension
 * point for exactly this, so nothing about the built-in sidebar is patched.
 *
 * The modal is opened `headless`. The host's default chrome is a confirmation
 * card — a fixed 380px box whose body grows past the viewport instead of
 * scrolling — and a list of hundreds of rows needs a header, a scrolling
 * middle, and a footer that stay put. Headless hands over everything inside
 * the card while the host keeps the mask, the Escape key, and the dialog role,
 * so the panel owns its layout outright rather than fighting chrome meant for
 * something else.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Props the slot owner supplies to a footer action. */
export interface FooterActionProps {
    /** Whether the sidebar is expanded; collapsed rows show the icon only. */
    readonly wide?: boolean;
    /**
     * Session list and current selection, a standard prop on every slot.
     *
     * The host half cannot see which session is selected — that is browser
     * state, and no host surface publishes it — but this half can, and the
     * background shutdown needs it to leave the foreground session alone.
     */
    readonly useSessions: <T>(selector: (state: {
        readonly current: string | undefined;
    }) => T) => T;
}
/** The sidebar footer entry, and the archive area it opens. */
export declare function createArchivePanel(ctx: Context): (props: FooterActionProps) => JSX.Element;
