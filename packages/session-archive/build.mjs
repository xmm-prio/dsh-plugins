/**
 * Three outputs: the host half as Node ESM, the browser half wrapped in the
 * ModuleLoader closure handshake, and the declarations the two `exports`
 * entries point at.
 *
 * `lib/` is committed rather than built on install. pnpm refuses to run a
 * git dependency's build scripts unless the consumer allowlists it by a
 * commit-pinned key, so a package that builds itself on install is a package
 * that cannot be installed from git without per-commit ceremony. Shipping the
 * artifacts in the snapshot is what makes `dsh plugin add <git url>` work with
 * no configuration at all.
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

import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'))

// `tsc` leaves stale declarations behind when a source file is renamed, and a
// committed `lib/` would carry them forever.
await rm(join(here, 'lib'), { recursive: true, force: true })

/** The specifiers the browser bundle is allowed to `require`. */
const browserExternal = manifest.dsh.client.external

const banner =
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {` +
  ' var module = { exports: {} }; var exports = module.exports;' +
  " Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });"

await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile: join(here, 'lib/index.js'),
  // esbuild writes each module's path into a comment, relative to this
  // directory. Pinning it to the package keeps the emitted bytes the same no
  // matter where the build was invoked from — which a committed artifact needs,
  // or `pnpm build` from the repo root produces a whole-file diff.
  absWorkingDir: here,
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
  absWorkingDir: here,
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  jsx: 'automatic',
  jsxImportSource: 'react',
  // The panel's stylesheet rides along as a string and is injected at module
  // scope. esbuild's default `css` loader would emit a second output file, and
  // the ModuleLoader only ever fetches the one bundle.
  loader: { '.css': 'text' },
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

// Declarations for the two `exports` entries. Invoked through `process.execPath`
// rather than the `.bin` shim, which on Windows is a `.CMD` that `execFile`
// cannot run. Emitting also type-checks `src/`, so a type error fails the build.
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], {
  cwd: here,
  stdio: 'inherit',
})
console.log('  lib\\types')
