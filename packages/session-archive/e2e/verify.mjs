/**
 * Acceptance run for the two browser-facing issues, against a real Chromium.
 *
 *   issue 11 — the bulk-archive buttons injected into the sidebar's rows
 *   issue 09 — the archive area opened from the sidebar footer
 *
 * Every fixture is created through the host's own services and lives in a
 * scratch `DSH_HOME` the harness deletes on the way out.
 *
 * Run: node e2e/verify.mjs [--headed]
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

const INJECTED = '[data-session-archive-row-action]'

const harness = await startHarness({ headless })
const page = harness.page
const panel = page.getByRole('dialog', { name: '归档区' })
const confirmation = page.getByRole('dialog', { name: '删除会话日志' })

/** Every project row: its text, its action strip's layout, and our button's state. */
const rowReport = () =>
  page.evaluate(
    (injected) =>
      [...document.querySelectorAll('[class*="_projectRow"]')].map((row) => {
        const actions = row.querySelector(':scope > [class*="_rowActions"]')
        const mine = actions?.querySelector(injected)
        return {
          text: row.textContent,
          layout: [...(actions?.children ?? [])].map((child) => (child.matches(injected) ? 'MINE' : child.tagName.toLowerCase())),
          title: mine?.title,
          disabled: mine?.disabled,
        }
      }),
    INJECTED,
  )

/** Click a row's injected button. `force` stands in for the CSS hover reveal. */
async function clickRowButton(rowIndex) {
  const row = page.locator('[class*="_projectRow"]').nth(rowIndex)
  await row.hover().catch(() => {})
  await row.locator(INJECTED).click({ force: true })
}

/** The sidebar as rendered: each project row with the session ids listed under it. */
const renderedGroups = () =>
  page.evaluate(() => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const idOf = (row) => {
      const key = Object.keys(row).find((name) => name.startsWith('__reactFiber$'))
      for (let fiber = row[key], depth = 0; fiber != null && depth < 12; fiber = fiber.return, depth += 1) {
        if (typeof fiber.key === 'string' && UUID.test(fiber.key)) return fiber.key
        for (const value of Object.values(fiber.memoizedProps ?? {})) {
          if (typeof value === 'string' && UUID.test(value)) return value
          if (value !== null && typeof value === 'object' && typeof value.id === 'string' && UUID.test(value.id)) return value.id
        }
      }
      return '?'
    }
    const groups = []
    for (const row of document.querySelectorAll('[class*="_projectRow"], [class*="_sessionRow"]')) {
      if (row.className.includes('projectRow')) groups.push({ label: row.textContent, sessions: [] })
      else groups.at(-1)?.sessions.push(idOf(row))
    }
    return groups
  })

/** Click a project row until its session list is on screen, then read the tree. */
async function expandGroup(label) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const groups = await renderedGroups()
    if ((groups.find((group) => group.label?.includes(label))?.sessions.length ?? 0) > 0) return groups
    await page.locator('[class*="_projectRow"]').filter({ hasText: label }).first().click({ force: true })
    await page.waitForTimeout(1200)
  }
  return renderedGroups()
}

/** Open the archive area from the sidebar footer, and time it. */
async function openPanel() {
  const started = Date.now()
  await page.getByRole('button', { name: '归档区', exact: true }).click()
  await panel.getByText(/已选择 \d+ 个/).first().waitFor({ timeout: 20_000 })
  return Date.now() - started
}

async function closePanel() {
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await panel.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
}

/** Tick the checkbox of every archive-area row whose text mentions `needle`. */
async function selectEntries(needle) {
  const rows = panel.locator('li').filter({ hasText: needle })
  const count = await rows.count()
  for (let index = 0; index < count; index += 1) await rows.nth(index).locator('input[type="checkbox"]').check()
  return count
}

const selectionLabel = () => panel.getByText(/已选择 \d+ 个/).first().textContent()

try {
  // ═════════════════════════════════════════ issue 11 · sidebar row buttons

  const seeded = await harness.call('e2e-fixtures.seed', {
    workspaces: [
      { dir: 'alpha', title: '工作区 Alpha', sessions: 3 },
      { dir: 'beta', title: '', sessions: 2 },
    ],
    ungrouped: 2,
  })
  const alpha = seeded.workspaces[0]
  const beta = seeded.workspaces[1]
  await harness.reloadSidebar()
  await page.waitForSelector(INJECTED, { state: 'attached', timeout: 20_000 })
  await page.waitForTimeout(600)

  // Expand everything once, so the rendered session lists are inspectable.
  const rowCount = await page.locator('[class*="_projectRow"]').count()
  for (let index = 0; index < rowCount; index += 1) {
    await page.locator('[class*="_projectRow"]').nth(index).click({ force: true })
  }
  await page.waitForTimeout(1200)
  console.log(`\nsidebar as rendered: ${JSON.stringify(await renderedGroups(), undefined, 1)}`)
  console.log(`host ledger: ${JSON.stringify((await harness.call('e2e-fixtures.snapshot')).workspaces, undefined, 1)}\n`)

  const rows = await rowReport()
  check(
    '11 · both workspace rows and the ungrouped row carry exactly one button',
    rows.length === 3 && rows.every((row) => row.layout.filter((tag) => tag === 'MINE').length === 1),
    JSON.stringify(rows.map((row) => row.layout)),
  )
  check(
    '11 · the button sits immediately before the row\'s "+"',
    rows.every((row) => row.layout.at(-1) === 'button' && row.layout.at(-2) === 'MINE'),
  )
  check(
    '11 · an empty workspace title is not mistaken for the ungrouped row',
    rows.filter((row) => row.title?.includes('未分组')).length === 1 && rows.some((row) => row.title?.includes('未命名工作区')),
    rows.map((row) => row.title).join(' | '),
  )
  check(
    "11 · the count comes from the row's own group, not from a second reconstruction",
    rows.some((row) => row.title === '归档「工作区 Alpha」中的 3 个会话') && rows.some((row) => row.title === '归档「未分组」中的 2 个会话'),
    rows.map((row) => row.title).join(' | '),
  )
  check(
    '11 · nothing is injected into session rows',
    (await page.locator('[class*="_sessionRow"]').count()) > 0 &&
      (await page.evaluate(
        (injected) => [...document.querySelectorAll('[class*="_sessionRow"]')].every((row) => row.querySelector(injected) === null),
        INJECTED,
      )),
    `session rows on screen: ${String(await page.locator('[class*="_sessionRow"]').count())}`,
  )

  await clickRowButton(rows.findIndex((row) => row.title?.includes('工作区 Alpha')))
  await page.waitForTimeout(3000)
  const afterAlpha = await harness.call('e2e-fixtures.snapshot')
  check(
    "11 · clicking a workspace row archives exactly that row's sessions",
    afterAlpha.archived.length === 3 && alpha.sessionIds.every((id) => afterAlpha.archived.includes(id)),
    `archived=${String(afterAlpha.archived.length)}`,
  )
  const alphaTitle = (await rowReport()).find((row) => row.text?.includes('工作区 Alpha'))?.title
  check('11 · the button reports the outcome where the pointer already is', alphaTitle === '已归档 3 个会话', String(alphaTitle))

  // The live session DSH opens for itself is blank, so the host skips it while
  // still counting it in the row's own total.
  const betaRowIndex = (await rowReport()).findIndex((row) => row.title?.includes('未命名工作区'))
  const betaCount = (await rowReport())[betaRowIndex]?.title
  await clickRowButton(betaRowIndex)
  await page.waitForTimeout(3000)
  const betaReport = (await rowReport())[betaRowIndex]?.title
  const afterBeta = await harness.call('e2e-fixtures.snapshot')
  check(
    '11 · a row whose count includes an unarchivable session says what it skipped',
    beta.sessionIds.every((id) => afterBeta.archived.includes(id)) && betaReport?.includes('跳过'),
    `${String(betaCount)} → ${String(betaReport)}`,
  )

  await clickRowButton((await rowReport()).findIndex((row) => row.title?.includes('未分组')))
  await page.waitForTimeout(3000)
  const afterUngrouped = await rowReport()
  const errors = harness.consoleLog.filter((line) => line.startsWith('error') || line.startsWith('pageerror'))
  check(
    '11 · archiving the ungrouped row empties it without an error',
    afterUngrouped.every((row) => !row.text?.includes('未分组')) && errors.length === 0,
    `rows=${String(afterUngrouped.length)} errors=${errors.join(' / ')}`,
  )
  check('11 · the surviving rows keep their buttons', afterUngrouped.length > 0 && afterUngrouped.every((row) => row.layout.includes('MINE')))

  const rail = page.locator('button[class*="_toggle"]').first()
  await rail.click({ force: true })
  await page.waitForTimeout(900)
  const collapsed = await rowReport()
  await rail.click({ force: true })
  await page.waitForTimeout(1400)
  const reexpanded = await rowReport()
  check(
    '11 · buttons come back after the sidebar collapses to the rail and reopens',
    collapsed.length === 0 && reexpanded.length > 0 && reexpanded.every((row) => row.layout.includes('MINE')),
    `collapsed rows=${String(collapsed.length)} · reopened rows=${String(reexpanded.length)}`,
  )

  // Break recognition the way an upstream redesign would: the rows still
  // render, but the action strip is no longer a direct child.
  const logMark = harness.consoleLog.length
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('[class*="_projectRow"]')) {
      const actions = row.querySelector(':scope > [class*="_rowActions"]')
      if (actions === null) continue
      const wrapper = document.createElement('div')
      row.append(wrapper)
      wrapper.append(actions)
    }
  })
  for (let round = 0; round < 10; round += 1) {
    await page.mouse.move(120, 200 + round)
    await page.waitForTimeout(220)
  }
  const remaining = await page.evaluate((injected) => document.querySelectorAll(injected).length, INJECTED)
  const warnings = harness.consoleLog.slice(logMark).filter((line) => line.includes('sidebar row buttons'))
  check('11 · accumulated recognition failures disable every injection', remaining === 0, `remaining=${String(remaining)}`)
  check('11 · the kill-switch explains itself exactly once', warnings.length === 1, warnings.join(' / '))
  check(
    '11 · the built-in sidebar is untouched by the shutdown',
    (await page.evaluate(() => document.querySelectorAll('[class*="_projectRow"]').length)) > 0,
  )

  // ═════════════════════════════════════════ issue 09 · the archive area

  await harness.reloadSidebar()
  await page.waitForTimeout(600)

  const preBulk = await harness.call('e2e-fixtures.snapshot')
  const smallOpen = await openPanel()
  const smallCount = await panel.locator('li').count()
  check(
    '09 · the sidebar footer button opens the archive area',
    smallCount === preBulk.archived.length,
    `entries=${String(smallCount)} · archive set=${String(preBulk.archived.length)}`,
  )
  await closePanel()

  const bulk = await harness.call('e2e-fixtures.seed', { workspaces: [{ dir: 'bulk', title: '批量', sessions: 120 }] })
  await harness.call('e2e-fixtures.archive', { ids: bulk.workspaces[0].sessionIds })
  const large = (await harness.call('e2e-fixtures.snapshot')).archived.length
  await harness.reloadSidebar()
  const largeOpen = await openPanel()
  const largeCount = await panel.locator('li').count()
  check(
    '09 · open latency is essentially independent of how many sessions are archived',
    largeCount === large && largeOpen < Math.max(1200, smallOpen * 3),
    `${String(smallCount)} archived → ${String(smallOpen)}ms · ${String(largeCount)} archived → ${String(largeOpen)}ms`,
  )

  await panel.locator('input[type="checkbox"]').nth(0).check()
  await panel.locator('input[type="checkbox"]').nth(1).check()
  const two = await selectionLabel()
  await panel.getByRole('button', { name: '全选' }).click()
  const all = await selectionLabel()
  await panel.getByRole('button', { name: '取消选择' }).click()
  const none = await selectionLabel()
  check(
    '09 · multi-select, select-all and clear-selection all behave',
    two === '已选择 2 个' && all === `已选择 ${String(large)} 个` && none === '已选择 0 个',
    `${two} → ${all} → ${none}`,
  )

  const beforeCancel = await harness.call('e2e-fixtures.snapshot')
  await panel.locator('input[type="checkbox"]').nth(0).check()
  await panel.getByRole('button', { name: '删除', exact: true }).click()
  await confirmation.waitFor({ timeout: 10_000 })
  const confirmDisabled = await confirmation.getByRole('button', { name: '永久删除' }).isDisabled()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await confirmation.waitFor({ state: 'detached', timeout: 10_000 })
  await page.waitForTimeout(1000)
  const afterCancel = await harness.call('e2e-fixtures.snapshot')
  check(
    '09 · the delete confirmation can be cancelled with no side effect',
    confirmDisabled &&
      afterCancel.stored.length === beforeCancel.stored.length &&
      afterCancel.archived.length === beforeCancel.archived.length &&
      (await panel.locator('li').count()) === large,
    `confirm gated on acknowledgement=${String(confirmDisabled)} · stored ${String(beforeCancel.stored.length)}→${String(afterCancel.stored.length)} · archived ${String(beforeCancel.archived.length)}→${String(afterCancel.archived.length)}`,
  )

  // Unarchive must put the sessions back where they came from.
  const ledgerBefore = beforeCancel.workspaces.find((workspace) => workspace.workspaceId === alpha.workspaceId).sessionIds
  await panel.getByRole('button', { name: '取消选择' }).click()
  const picked = await selectEntries(alpha.path)
  const pickedLabel = await selectionLabel()
  await panel.getByRole('button', { name: '取消归档', exact: true }).click()
  await page.waitForTimeout(3000)
  const afterUnarchive = await harness.call('e2e-fixtures.snapshot')
  check(
    '09 · bulk unarchive removes exactly the selected sessions from the archive set',
    picked === 3 &&
      pickedLabel === '已选择 3 个' &&
      afterUnarchive.archived.length === large - 3 &&
      alpha.sessionIds.every((id) => !afterUnarchive.archived.includes(id)),
    `${pickedLabel} · archived ${String(beforeCancel.archived.length)}→${String(afterUnarchive.archived.length)}`,
  )

  await closePanel()
  await page.waitForTimeout(2000)
  const alphaRow = (await rowReport()).find((row) => row.text?.includes('工作区 Alpha'))
  const groups = await expandGroup('工作区 Alpha')
  const alphaGroup = groups.find((group) => group.label?.includes('工作区 Alpha'))
  const ledgerAfter = afterUnarchive.workspaces.find((workspace) => workspace.workspaceId === alpha.workspaceId).sessionIds
  check(
    '09 · unarchived sessions reappear under their original workspace row',
    alphaRow?.title === '归档「工作区 Alpha」中的 3 个会话',
    `row tooltip: ${String(alphaRow?.title)}`,
  )
  check(
    '09 · …at their original position, because the ledger was never rewritten',
    JSON.stringify(ledgerAfter) === JSON.stringify(ledgerBefore) && JSON.stringify(alphaGroup?.sessions) === JSON.stringify(ledgerBefore),
    `ledger ${JSON.stringify(ledgerBefore) === JSON.stringify(ledgerAfter) ? 'unchanged' : 'CHANGED'}\n        rendered ${JSON.stringify(alphaGroup?.sessions)}\n        ledger   ${JSON.stringify(ledgerBefore)}`,
  )

  // Delete, for real this time.
  await openPanel()
  const doomed = await selectEntries(beta.path)
  await panel.getByRole('button', { name: '删除', exact: true }).click()
  await confirmation.waitFor({ timeout: 10_000 })
  await confirmation.locator('input[type="checkbox"]').check()
  await confirmation.getByRole('button', { name: '永久删除' }).click()
  await page.waitForTimeout(5000)
  const afterDelete = await harness.call('e2e-fixtures.snapshot')
  check(
    '09 · bulk delete removes the logs, the archive-set members and the workspace links',
    doomed === 2 &&
      beta.sessionIds.every((id) => !afterDelete.stored.includes(id) && !afterDelete.archived.includes(id)) &&
      beta.sessionIds.every(
        (id) => !afterDelete.workspaces.find((workspace) => workspace.workspaceId === beta.workspaceId).sessionIds.includes(id),
      ),
    `selected=${String(doomed)} · stored ${String(afterUnarchive.stored.length)}→${String(afterDelete.stored.length)} · archived ${String(afterDelete.archived.length)}`,
  )
  await closePanel()

  // A blocked capability must name its reason instead of failing silently.
  // The probe runs on the host and cannot be broken from here without breaking
  // the host itself, so the block is injected on the wire instead: what is
  // under test is whether the panel renders a block, not whether it detects one.
  let rewrote = 'no capabilities request was intercepted'
  await page.route('**/api**', async (route) => {
    const request = route.request()
    if (!request.url().includes('capabilities') && !(request.postData() ?? '').includes('session-archive.capabilities')) {
      return route.fallback()
    }
    const response = await route.fetch()
    const body = await response.json()
    const blocked = { available: false, code: 'enqueue-operation-missing', subject: 'workspaceRegistry.enqueueOperation' }
    if (body?.result?.value?.capabilities === undefined) {
      rewrote = `unexpected envelope at ${request.url()}: ${JSON.stringify(body).slice(0, 200)}`
      return route.fulfill({ response })
    }
    body.result.value.capabilities.unarchive = blocked
    body.result.value.capabilities.delete = blocked
    rewrote = 'ok'
    // Re-declare status and headers rather than reusing the original response:
    // its content-length no longer matches the rewritten body.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  // A fresh mount, so the panel cannot be reading a capability report it
  // fetched before the block was in place.
  await harness.reloadSidebar()
  const onTheWire = await harness.call('session-archive.capabilities')
  await openPanel()
  await panel.getByRole('button', { name: '全选' }).click()
  const notice = await panel.textContent()
  const unarchiveOff = await panel.getByRole('button', { name: '取消归档', exact: true }).isDisabled()
  const deleteOff = await panel.getByRole('button', { name: '删除', exact: true }).isDisabled()
  check(
    '09 · a blocked capability names its reason and greys out its action',
    rewrote === 'ok' && notice.includes('宿主的写入队列已改变') && notice.includes('workspaceRegistry.enqueueOperation') && unarchiveOff && deleteOff,
    `wire rewrite: ${rewrote} · as the browser reads it: ${JSON.stringify(onTheWire.capabilities.unarchive)} · unarchive disabled=${String(unarchiveOff)} · delete disabled=${String(deleteOff)}`,
  )
  await closePanel()
} catch (error) {
  check('the run completed without an unexpected error', false, String(error?.stack ?? error))
} finally {
  const failed = results.filter((result) => !result.ok)
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed`)
  if (failed.length > 0) {
    // Outside the repo: a failing run should leave evidence, not artifacts.
    const shot = join(tmpdir(), `session-archive-e2e-${String(Date.now())}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log(`screenshot: ${shot}`)
    console.log(`page console tail:\n${harness.consoleLog.slice(-20).join('\n')}`)
  }
  await harness.close()
  process.exitCode = failed.length === 0 ? 0 : 1
}
