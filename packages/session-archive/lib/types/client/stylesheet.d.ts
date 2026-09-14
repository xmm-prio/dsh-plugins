/**
 * How this plugin's stylesheets reach the page.
 *
 * DSH's client module loader claims every untagged `<style>` element for the
 * plugin whose factory just ran, and drops them again when that plugin
 * unloads. Appending a tag at module scope, with no `data-plugin` attribute of
 * our own, is therefore all it takes to get the same lifecycle the first-party
 * packages get: the CSS arrives with the bundle and leaves with it.
 *
 * Each feature keeps its own sheet next to the components that use it; this
 * module is the one copy of the mechanism they share.
 */
/**
 * Install one stylesheet for the lifetime of the bundle.
 *
 * @param name - names the sheet in the loader's bookkeeping; no behaviour
 *   depends on it, so it only has to be recognisable in devtools.
 * @param css - the sheet, imported through esbuild's text loader.
 */
export declare function installStylesheet(name: string, css: string): void;
