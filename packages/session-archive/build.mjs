/**
 * Two esbuild targets: the host half as Node ESM, the browser half wrapped in
 * the ModuleLoader closure handshake.
 *
 * The upstream tsdown preset that produces the handshake is not published, so
 * the banner and footer reproduce it byte for byte. Three details are load
 * bearing:
 *
 * - `id` must be the full package name. A short name loads the bundle and then
 *   throws `loaded without registering "<name>"`, because the loader looks the
 *   registration up by the id it derived from the boot graph row.
 * - the `Symbol.toStringTag` line cannot be dropped; the loader's interop
 *   treats the returned object as a module namespace.
 * - `external` cannot be a glob. Only nine specifiers are unconditionally
 *   requireable in the browser, and anything else needs both a boot-graph row
 *   and an entry in `dsh.client.external`. The list below is the same one
 *   `package.json` declares, and the two must stay identical.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'))

/** The specifiers the browser bundle is allowed to `require`. */
const browserExternal = manifest.dsh.client.external

const banner =
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {` +
  ' var module = { exports: {} }; var exports = module.exports;' +
  " Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });"

await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile: join(here, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Every `@deepseek-ai/*` host package is type-only here, so nothing of the
  // host is bundled and nothing is left as a runtime import either. Only
  // schemastery — a pure value library with no Service or Context identity —
  // is inlined, which keeps the published package dependency-free.
  external: [],
  // The version the host half reports to the browser. Substituted from the
  // manifest so a bundle can never disagree with the package it shipped in,
  // which is the only thing reporting it is good for.
  define: { __PLUGIN_VERSION__: JSON.stringify(manifest.version) },
  logLevel: 'info',
})

await build({
  entryPoints: [join(here, 'src/client/index.ts')],
  outfile: join(here, 'lib/client.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: browserExternal,
  banner: { js: banner },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})

// esbuild puts its own `"use strict"` at the top of a cjs bundle, which lands
// inside the factory body where it is no longer a directive prologue. Dropping
// it keeps the emitted bytes equal in meaning to the first-party handshake.
const clientPath = join(here, 'lib/client.js')
const client = await readFile(clientPath, 'utf8')
await writeFile(clientPath, client.replace(`${banner}\n"use strict";`, banner))
