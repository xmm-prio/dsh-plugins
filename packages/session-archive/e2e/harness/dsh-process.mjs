/**
 * Boot a DSH web profile as a child process and hand back its one-time URL.
 *
 * The auth token is regenerated on every boot and stdout is its only source,
 * so the launcher owns the parse. `DSH_HOME` points at a scratch root: the
 * harness then creates workspaces and sessions freely without ever touching
 * the developer's own `~/.dsh`, and cleanup is a directory removal.
 *
 * @module e2e/harness/dsh-process
 */

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** Where a global install puts the launcher, per platform. */
const GLOBAL_BIN = [
  join(process.env['APPDATA'] ?? '', 'npm/node_modules/@deepseek-ai/dsh/lib/bin.js'),
  '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
  join(process.env['HOME'] ?? '', '.local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js'),
]

/**
 * The launcher entry point.
 *
 * Spawned as a script rather than through the `dsh` shim: on Windows the shim
 * is a `.ps1` wrapper and the one-time token URL never reaches this process's
 * stdout, which is the only place that token exists.
 */
const DSH_BIN = process.env['DSH_BIN'] ?? GLOBAL_BIN.find((path) => existsSync(path)) ?? GLOBAL_BIN[0]

/** The line DSH prints once the web server is listening. */
const URL_PATTERN = /dsh web: (http:\/\/\S+)/

/** Cold boot resolves the whole bundle graph; 30s is typical, so allow slack. */
const BOOT_TIMEOUT_MS = 180_000

/**
 * A booted harness: the URL to open, and the way to stop it.
 *
 * @typedef {object} DshProcess
 * @property {string} url - the one-time `?token=` URL printed on stdout.
 * @property {string} origin - the server origin, for `/api` calls.
 * @property {string} home - the scratch `DSH_HOME` this boot used.
 * @property {() => string} output - everything the process has printed so far.
 * @property {() => Promise<void>} stop - terminate and wait for exit.
 */

/**
 * Materialize a scratch profile so the first real boot has nothing to install.
 * @param {string} home - the scratch `DSH_HOME`.
 * @returns {Promise<void>}
 */
async function initializeHome(home) {
  if (!existsSync(DSH_BIN)) {
    throw new Error(`no DSH launcher at ${DSH_BIN}; install DSH globally or set DSH_BIN to its lib/bin.js`)
  }
  await mkdir(home, { recursive: true })
  const child = spawn(process.execPath, [DSH_BIN, '--profile', 'web', '--dump-default-config'], {
    env: { ...process.env, DSH_HOME: home },
    stdio: 'ignore',
  })
  const [code] = await once(child, 'exit')
  if (code !== 0) throw new Error(`dsh could not materialize a profile under ${home} (exit ${String(code)})`)
}

/**
 * Boot a DSH web profile.
 *
 * @param {object} options - boot options.
 * @param {string} options.home - scratch `DSH_HOME`; created if absent.
 * @param {readonly string[]} options.overlays - absolute overlay paths, in order.
 * @param {number} options.port - listen port.
 * @param {boolean} [options.echo] - mirror the child's output onto this process's stdout.
 * @returns {Promise<DshProcess>} the booted harness.
 */
export async function bootDsh({ home, overlays, port, echo = false }) {
  await initializeHome(home)

  const args = [DSH_BIN, '--profile', 'web']
  for (const overlay of overlays) args.push('--patch', overlay)
  args.push('--no-open', '--port', String(port))

  const child = spawn(process.execPath, args, {
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let transcript = ''
  /** @type {((line: string) => void) | undefined} */
  let onChunk
  const collect = (chunk) => {
    const value = String(chunk)
    transcript += value
    if (echo) process.stdout.write(value)
    onChunk?.(transcript)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill()
    // The web server holds the port until the process is gone; a listener that
    // ignores SIGTERM would otherwise make the next boot fail with EADDRINUSE.
    const exited = once(child, 'exit')
    const forced = setTimeout(() => child.kill('SIGKILL'), 5_000)
    try {
      await exited
    } finally {
      clearTimeout(forced)
    }
  }

  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`dsh did not print its URL within ${String(BOOT_TIMEOUT_MS)}ms:\n${transcript}`))
    }, BOOT_TIMEOUT_MS)
    const settle = (error, value) => {
      clearTimeout(timer)
      onChunk = undefined
      if (error) reject(error)
      else resolve(value)
    }
    onChunk = (text) => {
      const match = URL_PATTERN.exec(text)
      if (match !== null) settle(undefined, match[1])
    }
    child.on('exit', (code) => {
      settle(new Error(`dsh exited with code ${String(code)} before printing its URL:\n${transcript}`))
    })
    onChunk(transcript)
  }).catch(async (error) => {
    await stop()
    throw error
  })

  return { url, origin: new URL(url).origin, home, output: () => transcript, stop }
}

/**
 * Remove a scratch harness home.
 * @param {string} home - the directory to delete.
 * @returns {Promise<void>}
 */
export async function removeHome(home) {
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
