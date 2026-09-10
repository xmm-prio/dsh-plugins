/**
 * One call that puts a real, rendered DSH sidebar in front of a test.
 *
 * Boots a DSH web profile against a scratch `DSH_HOME` with two overlay rows —
 * the plugin under test and the fixture plugin — opens the printed one-time
 * URL in Chromium so the token becomes a cookie, and hands back the page plus
 * a JSON-RPC caller for both halves' endpoints.
 *
 * @module e2e/harness
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { bootDsh, removeHome } from './dsh-process.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')

/** Overlay paths must be forward-slashed on Windows. */
const posix = (path) => path.replaceAll('\\', '/')

/**
 * A running harness.
 *
 * @typedef {object} Harness
 * @property {import('playwright').Page} page - the page with the DSH UI loaded.
 * @property {import('playwright').Browser} browser - the Chromium instance.
 * @property {(endpoint: string, payload?: unknown) => Promise<unknown>} call - `/api` caller.
 * @property {() => string} hostLog - everything DSH has printed.
 * @property {readonly string[]} consoleLog - everything the page has logged.
 * @property {() => Promise<void>} close - stop the browser, DSH, and delete the scratch home.
 */

/**
 * Boot DSH, seed fixtures, and open the UI.
 *
 * @param {object} [options] - harness options.
 * @param {number} [options.port] - listen port.
 * @param {boolean} [options.headless] - run Chromium headless.
 * @param {boolean} [options.echo] - mirror DSH's stdout.
 * @param {object} [options.viewport] - browser viewport; wide enough for an expanded sidebar.
 * @returns {Promise<Harness>} the running harness.
 */
export async function startHarness(options = {}) {
  const { port = 3181, headless = true, echo = false, viewport = { width: 1400, height: 900 } } = options

  const scratch = await mkdtemp(join(tmpdir(), 'dsh-sa-e2e-'))
  const home = join(scratch, 'home')
  const fixtureRoot = join(scratch, 'workspaces')

  const overlay = join(scratch, 'overlay.yml')
  await writeFile(
    overlay,
    [
      '- insert:',
      '    - id: session-archive',
      `      name: '${posix(join(packageRoot, 'lib/index.js'))}'`,
      '    - id: e2e-fixtures',
      `      name: '${posix(join(here, 'fixture-plugin/index.js'))}'`,
      '      config:',
      `        root: '${posix(fixtureRoot)}'`,
      '',
    ].join('\n'),
    'utf8',
  )

  const dsh = await bootDsh({ home, overlays: [overlay], port, echo })

  let browser
  let page
  try {
    browser = await chromium.launch({ headless })
    page = await browser.newPage({ viewport })
    const consoleLog = []
    page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`))
    page.on('pageerror', (error) => consoleLog.push(`pageerror: ${error.message}`))

    // The printed URL carries the one-time token; loading it sets the cookie
    // every later request (including the page's own `/api` calls) relies on.
    await page.goto(dsh.url, { waitUntil: 'domcontentloaded' })
    await dismissOnboarding(page)

    /** Call any `/api` endpoint from inside the page, so the cookie applies. */
    const call = async (endpoint, payload = {}) =>
      page.evaluate(
        async ([name, body]) => {
          const response = await fetch(`/api/${name}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: name, payload: body }),
          })
          if (!response.ok) throw new Error(`${name}: HTTP ${String(response.status)}`)
          const envelope = await response.json()
          if (!envelope.result.ok) throw new Error(`${name}: ${envelope.result.error.code} ${envelope.result.error.message}`)
          return envelope.result.value
        },
        [endpoint, payload],
      )

    const close = async () => {
      await browser.close().catch(() => {})
      await dsh.stop()
      await removeHome(home)
      await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
    }

    /** Reload and wait until the sidebar has re-derived its groups from the host. */
    const reloadSidebar = async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await dismissOnboarding(page)
      await waitForSidebar(page)
    }

    return { page, browser, call, hostLog: dsh.output, consoleLog, close, reloadSidebar }
  } catch (error) {
    await browser?.close().catch(() => {})
    await dsh.stop()
    await removeHome(home)
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
    throw error
  }
}

/**
 * Close the chain of first-run dialogs.
 *
 * A fresh `DSH_HOME` shows the preview notice and then the API-key prompt, each
 * behind a pointer-blocking mask that makes every sidebar row unclickable.
 *
 * @param {import('playwright').Page} page - the loaded page.
 * @returns {Promise<void>}
 */
async function dismissOnboarding(page) {
  const labels = ['继续', '稍后配置']
  const deadline = Date.now() + 30_000
  // The dialogs mount after the first paint, so absence early is not absence.
  // Keep looking until the app has been quiet for a whole idle round.
  let idleRounds = 0
  while (Date.now() < deadline && idleRounds < 2) {
    let clicked = false
    for (const label of labels) {
      const button = page.getByRole('button', { name: label, exact: true })
      if (!(await button.first().isVisible().catch(() => false))) continue
      await button.first().click({ timeout: 5_000 }).catch(() => {})
      clicked = true
      break
    }
    idleRounds = clicked ? 0 : idleRounds + 1
    await page.waitForTimeout(clicked ? 300 : 1_200)
  }
  await page
    .locator('[class*="_mask_"]')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {})
}

/**
 * Wait until the workspace browser has rendered rows *and* the session list has
 * landed, so `props.group.sessionCount` is the settled value rather than zero.
 * @param {import('playwright').Page} page - the loaded page.
 * @returns {Promise<void>}
 */
export async function waitForSidebar(page) {
  await page.waitForSelector('[class*="_projectRow"]', { timeout: 30_000 })
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[class*="_projectRow"]')].some((row) => {
        const key = Object.keys(row).find((name) => name.startsWith('__reactFiber$'))
        if (key === undefined) return false
        for (let fiber = row[key], depth = 0; fiber != null && depth < 12; fiber = fiber.return, depth += 1) {
          const group = fiber.memoizedProps?.group
          if (group?.sessionCount > 0) return true
        }
        return false
      }),
    undefined,
    { timeout: 30_000 },
  )
}
