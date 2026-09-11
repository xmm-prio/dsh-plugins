/**
 * Stylesheets are bundled as text, not as a separate CSS output file: the
 * browser half ships as one JavaScript bundle that the ModuleLoader evaluates,
 * and there is nowhere for a second artefact to be fetched from.
 *
 * `build.mjs` configures esbuild's `text` loader for `.css` to match.
 */
declare module '*.css' {
  const css: string
  export default css
}
