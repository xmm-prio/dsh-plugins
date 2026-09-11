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
/**
 * Class names, shared between `panel.css` and the JSX below it.
 *
 * The stylesheet is global rather than a CSS module, so renaming one of these
 * means renaming it in both files — this map is the reminder of where.
 */
export declare const cls: {
    readonly panel: "dsh-archive-panel";
    readonly head: "dsh-archive-head";
    readonly heading: "dsh-archive-heading";
    readonly title: "dsh-archive-title";
    readonly subtitle: "dsh-archive-subtitle";
    readonly close: "dsh-archive-close";
    readonly toolbar: "dsh-archive-toolbar";
    readonly search: "dsh-archive-search";
    readonly list: "dsh-archive-list";
    readonly group: "dsh-archive-group";
    readonly groupHead: "dsh-archive-group-head";
    readonly groupIcon: "dsh-archive-group-icon";
    readonly groupName: "dsh-archive-group-name";
    readonly groupCount: "dsh-archive-group-count";
    readonly rows: "dsh-archive-rows";
    readonly row: "dsh-archive-row";
    readonly rowLabel: "dsh-archive-row-label";
    readonly check: "dsh-archive-check";
    readonly rowTitle: "dsh-archive-row-title";
    readonly rowMeta: "dsh-archive-row-meta";
    readonly separator: "dsh-archive-sep";
    readonly notices: "dsh-archive-notices";
    readonly notice: "dsh-archive-notice";
    readonly noticeSubject: "dsh-archive-notice-subject";
    readonly status: "dsh-archive-status";
    readonly empty: "dsh-archive-empty";
    readonly foot: "dsh-archive-foot";
    readonly footInfo: "dsh-archive-foot-info";
    readonly provenance: "dsh-archive-provenance";
};
