/**
 * Acceptance run for the two shutdown issues, against a real Chromium.
 *
 *   issue 13 — closing background sessions must not take DSH down with it
 *   issue 14 — closing one session's agent from that session's header
 *
 * The check that matters most is the dullest one: DSH is still running
 * afterwards. Its boot installs a process-wide `unhandledRejection` handler
 * that writes `dsh: fatal load failure:` and exits(1), so a promise stranded
 * anywhere in a teardown kills the harness — and the only teardown in the
 * system that DSH itself never performs is this plugin's.
 *
 * Run: node e2e/verify-shutdown.mjs [--headed]
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startHarness } from './harness/index.mjs'

const headless = !process.argv.includes('--headed')

const results = []
/** Record one acceptance check. */
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `\n        ${detail}`}`)
}

// Its own port: this suite runs right after `verify.mjs`, and the socket that
// one listened on can still be releasing when this one boots.
const harness = await startHarness({ headless, port: 3182 })
const page = harness.page
const panel = page.getByRole('dialog', { name: '归档区' })
const bulkConfirm = page.getByRole('dialog', { name: '关闭运行中的会话' })
const sessionConfirm = page.getByRole('dialog', { name: '关闭这个会话的 agent' })

/** Press a confirmation's primary action and wait for the card to go away. */
async function confirmAnd(dialog, label) {
  await dialog.getByRole('button', { name: label, exact: true }).click()
  await dialog.waitFor({ state: 'detached', timeout: 15_000 })
  await page.waitForTimeout(3_000)
}

/** Which sessions the host currently has a live agent for. */
const liveAgents = async () => (await harness.call('e2e-fixtures.agents')).live

/** The prompt that gives the current session a title and a non-empty log. */
const CURRENT_TITLE = '前台会话'

/** Everything DSH has printed, and whether any of it was fatal. */
const fatal = () => harness.hostLog().includes('fatal load failure')

async function openPanel() {
  if (await panel.isVisible().catch(() => false)) return
  await page.getByRole('button', { name: '归档区', exact: true }).click()
  await panel.getByText(/已选择 \d+ 个/).first().waitFor({ timeout: 20_000 })
}

async function closePanel() {
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await panel.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
}

/**
 * Give the session the browser is showing a turn of its own.
 *
 * DSH renders a blank session as the new-session hero — composer only, no
 * header — so there is no utilities strip for a session-scoped slot to
 * occupy until the session has content. No model is configured here, so the
 * turn fails; what matters is that the log is no longer empty and the
 * session is resumed into a live agent, which is the state the header button
 * exists for.
 */
async function startCurrentSession() {
  const composer = page.locator('textarea, [contenteditable="true"]').first()
  await composer.click()
  await composer.fill(CURRENT_TITLE)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '更多操作' }).waitFor({ timeout: 30_000 })
}

/** Open the archive area and press the background-shutdown button. */
async function startBulkShutdown() {
  await openPanel()
  await panel.getByRole('button', { name: '关闭后台运行中的会话' }).click()
  await bulkConfirm.waitFor({ timeout: 15_000 })
  return bulkConfirm.locator('li').allTextContents()
}

try {
  const seeded = await harness.call('e2e-fixtures.seed', {
    workspaces: [{ dir: 'alpha', title: '工作区 Alpha', sessions: 4 }],
    ungrouped: 0,
  })
  const seededIds = seeded.workspaces[0].sessionIds
  await harness.reloadSidebar()
  await startCurrentSession()

  // ════════════════════════════════════ issue 13 · background shutdown

  await harness.call('e2e-fixtures.resume', { ids: seededIds })
  const live = await liveAgents()
  const current = live.find((id) => !seededIds.includes(id))
  check(
    '13 · every seeded session has a live agent, plus the one the browser opened',
    seededIds.every((id) => live.includes(id)) && current !== undefined,
    `live=${String(live.length)} · browser's own=${String(current)}`,
  )

  const listed = await startBulkShutdown()
  check(
    '13 · the confirmation lists the sessions by name instead of counting them',
    listed.length === seededIds.length && (await bulkConfirm.textContent()).includes(`即将停止 ${String(listed.length)} 个`),
    `${String(listed.length)} rows: ${listed.join(' | ').slice(0, 120)}`,
  )
  check(
    '13 · the session the browser is showing is not among them',
    (await bulkConfirm.textContent()).includes('你正在查看的会话不在其中'),
  )

  await confirmAnd(bulkConfirm, '取消')
  check(
    '13 · cancelling closes nothing',
    (await liveAgents()).length === live.length,
    `live still ${String((await liveAgents()).length)}`,
  )

  await startBulkShutdown()
  await confirmAnd(bulkConfirm, '确认关闭')
  const afterBulk = await liveAgents()
  check(
    '13 · confirming closes every background session and leaves the current one',
    afterBulk.length === 1 && afterBulk[0] === current,
    `live=${JSON.stringify(afterBulk)}`,
  )
  check('13 · the panel reports what it closed', (await panel.textContent()).includes('已关闭 4 个'), (await panel.textContent()).slice(-80))
  check('13 · DSH is still running', !fatal() && (await harness.call('e2e-fixtures.agents')) !== undefined)

  // A teardown that fails is the branch an idle agent never reaches: no model
  // is configured here, so a real agent always stops cleanly. The fixture
  // registers agents whose disposer rejects, behind the same effect label and
  // the same cordis machinery a real one uses.
  await harness.call('e2e-fixtures.lifecycle', { id: 'stuck-a', mode: 'reject' })
  await harness.call('e2e-fixtures.lifecycle', { id: 'stuck-b', mode: 'reject-after-detach' })
  await harness.call('e2e-fixtures.lifecycle', { id: 'fine', mode: 'ok' })
  await startBulkShutdown()
  await confirmAnd(bulkConfirm, '确认关闭')
  const report = await panel.textContent()
  check(
    '13 · one stuck session does not stop the others, and each failure is named',
    report.includes('已关闭 1 个') && report.includes('stuck-a') && report.includes('stuck-b'),
    report.replace(/\s+/g, ' ').slice(-200),
  )
  check('13 · a failed teardown does not take the process with it', !fatal())

  await closePanel()

  // ════════════════════════════════════ issue 14 · the session header button

  const headerButton = page.getByRole('button', { name: '关闭本会话的 agent' })
  check(
    '14 · the session header carries a close button while the session is running',
    await headerButton.isVisible(),
    `live agents: ${JSON.stringify(await liveAgents())}`,
  )

  await headerButton.click()
  await sessionConfirm.waitFor({ timeout: 15_000 })
  const sessionRows = await sessionConfirm.locator('li').allTextContents()
  check(
    '14 · it confirms for exactly one session, and says the subagents go with it',
    sessionRows.length === 1 && (await sessionConfirm.textContent()).includes('子代理'),
    `${String(sessionRows.length)} row: ${sessionRows.join('')}`,
  )

  await confirmAnd(sessionConfirm, '取消')
  check('14 · cancelling leaves the agent alone', (await liveAgents()).includes(current))

  await headerButton.click()
  await sessionConfirm.waitFor({ timeout: 15_000 })
  await confirmAnd(sessionConfirm, '确认关闭')
  check(
    '14 · confirming stops that session and nothing else',
    !(await liveAgents()).includes(current),
    `live=${JSON.stringify(await liveAgents())}`,
  )
  check(
    '14 · the button goes away once there is no agent left to stop',
    !(await headerButton.isVisible()),
  )
  check('14 · DSH survived the current session being closed from its own header', !fatal())

  const errors = harness.consoleLog.filter((line) => line.startsWith('error') || line.startsWith('pageerror'))
  check('13/14 · the browser logged no errors along the way', errors.length === 0, errors.join(' / ').slice(0, 300))
} catch (error) {
  check('the run completed without an unexpected error', false, String(error?.stack ?? error))
} finally {
  const failed = results.filter((result) => !result.ok)
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed`)
  if (failed.length > 0) {
    // Outside the repo: a failing run should leave evidence, not artifacts.
    const shot = join(tmpdir(), `session-archive-shutdown-e2e-${String(Date.now())}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log(`screenshot: ${shot}`)
    console.log(`host log tail:\n${harness.hostLog().slice(-2000)}`)
    console.log(`page console tail:\n${harness.consoleLog.slice(-20).join('\n')}`)
  }
  await harness.close()
  process.exitCode = failed.length === 0 ? 0 : 1
}
