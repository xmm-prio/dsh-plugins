/**
 * The archive area: the sidebar footer entry and the modal it opens.
 *
 * Registered into `sidebar.footer.action`, which is the host's own extension
 * point for exactly this, so nothing about the built-in sidebar is patched.
 */

import { Button, Modal, RiskConfirmation, Tag, fileSizeText, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'

import type { ArchivedSessionEntry, CapabilityId, OperationOutcome } from '../../contract.js'
import { buildArchiveView, entryLabel } from '../../domain/archive-view.js'
import type { ArchiveViewGroup } from '../../domain/archive-view.js'
import { blockText, callFailureText, deleteDescription, failureText, relativeText, text } from '../text.js'
import { createArchiveApi } from '../transport/archive-api.js'
import { ShutdownAll } from './ShutdownAll.js'
import { useArchive } from './useArchive.js'
import type { ArchiveState } from './useArchive.js'

/** Props the slot owner supplies to a footer action. */
export interface FooterActionProps {
  /** Whether the sidebar is expanded; collapsed rows show the icon only. */
  readonly wide?: boolean
}

/**
 * The archive list scrolls inside its own box.
 *
 * The host's `Modal` is a fixed-size card — `overflow: hidden`, no maximum
 * height — sized for confirmation dialogs. Content taller than the viewport
 * does not scroll, it is simply out of reach, so a list that can hold hundreds
 * of rows has to bound itself rather than expect the card to.
 */
const LIST_VIEWPORT = { maxHeight: '46vh', overflowY: 'auto' } as const

/** The prose the archive-area hook composes its reports out of. */
const copy = {
  describe: (outcome: Extract<OperationOutcome, { ok: false }>) => `${outcome.id}: ${failureText(outcome.code)}`,
  transport: callFailureText,
  unarchived: (count: number) => text.unarchivedCount(count),
  deleted: (count: number) => text.deletedCount(count),
}

/** The sidebar footer entry, and the archive area it opens. */
export function createArchivePanel(ctx: Context): (props: FooterActionProps) => JSX.Element {
  const api = createArchiveApi(ctx)

  return function ArchivePanel({ wide }: FooterActionProps): JSX.Element {
    const [open, setOpen] = useState(false)
    const state = useArchive(api, open, copy)

    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title={text.entryLabel}>
          {wide === false ? '归' : text.entryLabel}
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={text.panelTitle}
          closeLabel={text.close}
          description={text.panelDescription}
        >
          <ArchiveBody state={state} />
        </Modal>
      </>
    )
  }
}

function ArchiveBody({ state }: { state: ArchiveState }): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [query, setQuery] = useState('')
  const now = useMemo(() => Date.now(), [state.listing])
  const entries = state.listing?.entries ?? []
  const view = useMemo(() => buildArchiveView(entries, query), [entries, query])
  const shown = useMemo(() => view.groups.flatMap((group) => group.entries.map((entry) => entry.id)), [view])

  const closeConfirmation = useCallback(() => {
    setConfirming(false)
    setAcknowledged(false)
  }, [])

  const confirmDelete = useCallback(() => {
    closeConfirmation()
    void state.remove()
  }, [closeConfirmation, state])

  if (state.loading && state.listing === undefined) return <p>{text.loading}</p>

  if (state.loadError !== undefined) {
    return (
      <div>
        <p>
          {text.loadFailed}：{state.loadError}
        </p>
        <Button variant="outline" size="sm" onClick={state.reload}>
          {text.retry}
        </Button>
      </div>
    )
  }

  const selectedCount = state.selected.size

  return (
    <div>
      <CapabilityNotices state={state} />

      <ShutdownAll api={state.api} enabled={available(state, 'shutdown')} />

      {entries.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <>
          <div>
            <input
              type="search"
              value={query}
              placeholder={text.searchPlaceholder}
              aria-label={text.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => state.selectAll(shown)} disabled={shown.length === 0}>
              {text.selectAll}
            </Button>
            <Button variant="ghost" size="sm" onClick={state.clearSelection} disabled={selectedCount === 0}>
              {text.clearSelection}
            </Button>
            <Button variant="ghost" size="sm" onClick={state.reload} disabled={state.busy}>
              {text.refresh}
            </Button>
            <span>{text.selectedCount(selectedCount)}</span>
            <span>{text.totalSize(fileSizeText(state.listing?.totalSizeBytes ?? 0))}</span>
            {view.hidden === 0 ? null : <span>{text.hiddenBySearch(view.hidden)}</span>}
          </div>

          {view.groups.length === 0 ? (
            <p>{text.noMatch}</p>
          ) : (
            <div style={LIST_VIEWPORT}>
              {view.groups.map((group) => (
                <ArchiveGroup
                  key={group.workspaceId ?? ''}
                  group={group}
                  now={now}
                  selected={state.selected}
                  onToggle={state.toggle}
                />
              ))}
            </div>
          )}

          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount === 0 || state.busy || !available(state, 'unarchive')}
              onClick={() => void state.unarchive()}
            >
              {text.unarchive}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selectedCount === 0 || state.busy || !available(state, 'delete')}
              onClick={() => setConfirming(true)}
            >
              {text.deleteAction}
            </Button>
          </div>
        </>
      )}

      {state.report === undefined ? null : <p>{state.report.message}</p>}

      <Diagnostics state={state} />

      <RiskConfirmation
        open={confirming}
        title={text.deleteTitle}
        description={deleteDescription(selectedCount)}
        acknowledgeLabel={text.deleteAcknowledge}
        cancelLabel={text.deleteCancel}
        closeLabel={text.close}
        confirmLabel={text.deleteConfirm}
        acknowledged={acknowledged}
        disabled={state.busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={closeConfirmation}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

/** One original workspace, with its archived sessions under it. */
function ArchiveGroup({
  group,
  now,
  selected,
  onToggle,
}: {
  group: ArchiveViewGroup
  now: number
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
}): JSX.Element {
  const label =
    group.workspaceId === undefined
      ? text.ungrouped
      : group.title !== undefined && group.title.length > 0
        ? group.title
        : text.untitledWorkspace
  return (
    <section>
      <header>
        <Tag tone={group.workspaceId === undefined ? 'quiet' : 'outline'}>{label}</Tag>
        <span>{text.groupSummary(group.entries.length, fileSizeText(group.sizeBytes))}</span>
      </header>
      <ul>
        {group.entries.map((entry) => (
          <ArchiveRow
            key={entry.id}
            entry={entry}
            now={now}
            selected={selected.has(entry.id)}
            onToggle={() => onToggle(entry.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function ArchiveRow({
  entry,
  now,
  selected,
  onToggle,
}: {
  entry: ArchivedSessionEntry
  now: number
  selected: boolean
  onToggle: () => void
}): JSX.Element {
  const activity = entry.lastActivityAt ?? entry.createdAt
  return (
    <li>
      <label>
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span>{entryLabel(entry)}</span>
      </label>
      <span title={new Date(entry.createdAt).toLocaleString()}>
        {text.createdAt} {relativeText(relativeTime(entry.createdAt, now))}
      </span>
      <span title={new Date(activity).toLocaleString()}>
        {text.lastActivityAt} {relativeText(relativeTime(activity, now))}
      </span>
      <span>{entry.sizeBytes === undefined ? text.unknownSize : fileSizeText(entry.sizeBytes)}</span>
      {entry.cwd === undefined ? null : <span title={entry.cwd}>{entry.cwd}</span>}
    </li>
  )
}

/** Whether a capability is on; unknown capabilities are treated as on. */
function available(state: ArchiveState, id: CapabilityId): boolean {
  return state.capabilities?.capabilities[id].available ?? true
}

function CapabilityNotices({ state }: { state: ArchiveState }): JSX.Element | null {
  const report = state.capabilities?.capabilities
  if (report === undefined) return null
  const blocked = (['unarchive', 'delete', 'shutdown'] as const)
    .map((id) => ({ id, status: report[id] }))
    .filter((entry) => !entry.status.available)
  if (blocked.length === 0) return null
  return (
    <ul>
      {blocked.map(({ id, status }) => (
        <li key={id}>
          <Tag tone="warning">{id}</Tag>
          <span>{status.code === undefined ? '' : blockText(status.code)}</span>
          {status.subject === undefined ? null : <code>{status.subject}</code>}
        </li>
      ))}
    </ul>
  )
}

function Diagnostics({ state }: { state: ArchiveState }): JSX.Element | null {
  const listing = state.listing
  if (listing === undefined) return null
  return (
    <footer>
      {listing.degraded ? <p>{text.degradedMetadata}</p> : null}
      {listing.unresolved.length === 0 ? null : (
        <p>
          {String(listing.unresolved.length)} {text.unresolvedNotice}
        </p>
      )}
      {state.capabilities === undefined ? null : (
        <p>
          {text.backend}: <code>{state.capabilities.persistenceBackend}</code> · v{state.capabilities.version}
        </p>
      )}
    </footer>
  )
}
