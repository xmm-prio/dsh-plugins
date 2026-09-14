/**
 * The shutdown confirmation's stylesheet, and the single place its class
 * names are written down on the JavaScript side.
 *
 * The sheet is global rather than a CSS module, so renaming one of these
 * means renaming it in both files — this map is the reminder of where.
 */
/** Class names, shared between `shutdown.css` and the JSX beside it. */
export declare const cls: {
    readonly list: "dsh-shutdown-list";
    readonly row: "dsh-shutdown-row";
    readonly name: "dsh-shutdown-name";
    readonly note: "dsh-shutdown-note";
};
