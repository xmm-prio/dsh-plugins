/**
 * The panel's stylesheet, and the single place its class names are written
 * down on the JavaScript side.
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
