/**
 * The archive area: the sidebar footer entry and the modal it opens.
 *
 * Registered into `sidebar.footer.action`, which is the host's own extension
 * point for exactly this, so nothing about the built-in sidebar is patched.
 *
 * The modal is opened `headless`. The host's default chrome is a confirmation
 * card — a fixed 380px box whose body grows past the viewport instead of
 * scrolling — and a list of hundreds of rows needs a header, a scrolling
 * middle, and a footer that stay put. Headless hands over everything inside
 * the card while the host keeps the mask, the Escape key, and the dialog role,
 * so the panel owns its layout outright rather than fighting chrome meant for
 * something else.
 */

import {
  Button,
  IconArchiveOutline20,
  IconCloseOutline16,
  IconFolderClose16,
  IconRefreshOutline14,
  IconSearchOutline16,
  IconStopFill16,
  IconTrashOutline16,
  IconWarningOutline16,
  Input,
  Modal,
  RiskConfirmation,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'

import type { ArchivedSessionEntry, CapabilityId, OperationOutcome } from '../../contract.js'
import { buildArchiveView, entryLabel } from '../../domain/archive-view.js'
import type { ArchiveViewGroup } from '../../domain/archive-view.js'
import {
  blockText,
  callFailureText,
  catalogUnreadableText,
  deleteDescription,
  failureText,
  relativeText,
  text,
} from '../text.js'
import { createArchiveApi } from '../transport/archive-api.js'
import { ShutdownAll } from './ShutdownAll.js'
import { fileSizeText, relativeTime } from '../format.js'
import { cls } from './stylesheet.js'
import { useArchive } from './useArchive.js'
import type { ArchiveState } from './useArchive.js'

/** Props the slot owner supplies to a footer action. */
export interface FooterActionProps {
  /** Whether the sidebar is expanded; collapsed rows show the icon only. */
  readonly wide?: boolean
}

/** The prose the archive-area hook composes its reports out of. */
const copy = {
  describe: (outcome: Extract<OperationOutcome, { ok: false }>) => `${outcome.id}: ${failureText(outcome.code)}`,
  transport: callFailureText,
  unarchived: (count: number) => text.unarchivedCount(count),
  deleted: (count: number) => text.deletedCount(count),
}

/** A middot between two pieces of metadata. */
function Separator(): JSX.Element {
  return <span className={cls.separator}>·</span>
}

/** The sidebar footer entry, and the archive area it opens. */
export function createArchivePanel(ctx: Context): (props: FooterActionProps) => JSX.Element {
  const api = createArchiveApi(ctx)

  return function ArchivePanel({ wide }: FooterActionProps): JSX.Element {
    const [open, setOpen] = useState(false)
    const close = useCallback(() => {
      setOpen(false)
    }, [])
    const state = useArchive(api, open, copy)

    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconArchiveOutline20 size={16} />}
          aria-label={text.entryLabel}
          onClick={() => {
            setOpen(true)
          }}
        >
          {wide === false ? undefined : text.entryLabel}
        </Button>
        <Modal open={open} onClose={close} title={text.panelTitle} headless className={cls.panel}>
          <header className={cls.head}>
            <div className={cls.heading}>
              <h2 className={cls.title}>{text.panelTitle}</h2>
              <p className={cls.subtitle}>{text.panelDescription}</p>
            </div>
            <button type="button" className={cls.close} aria-label={text.close} onClick={close}>
              <IconCloseOutline16 size={14} />
            </button>
          </header>
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
  // The archive area's own line, for the one action that reports outside the
  // hook. Cleared whenever a hook-driven operation starts, so the status area
  // never shows an answer to a question the user has moved on from.
  const [notice, setNotice] = useState<string | undefined>(undefined)
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
    setNotice(undefined)
    void state.remove()
  }, [closeConfirmation, state])

  // "Nothing has arrived yet", not "a request is in flight": the first render
  // after opening happens before the effect that sets `loading`, and rendering
  // the empty state in that frame flashes 归档区是空的 at a user whose archive
  // is not empty. A reload after the first one keeps showing the old list.
  if (state.listing === undefined && state.loadError === undefined) {
    return <p className={cls.empty}>{text.loading}</p>
  }

  if (state.loadError !== undefined) {
    return (
      <div className={cls.empty}>
        <span>
          {text.loadFailed}：{state.loadError}
        </span>
        <Button variant="outline" size="sm" onClick={state.reload}>
          {text.retry}
        </Button>
      </div>
    )
  }

  const selectedCount = state.selected.size
  const status = notice ?? state.report?.message

  return (
    <>
      <div className={cls.toolbar}>
        <Input
          className={cls.search}
          type="search"
          value={query}
          icon={<IconSearchOutline16 size={14} />}
          placeholder={text.searchPlaceholder}
          aria-label={text.searchPlaceholder}
          disabled={entries.length === 0}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<IconRefreshOutline14 size={14} />}
          aria-label={text.refresh}
          title={text.refresh}
          disabled={state.busy}
          onClick={state.reload}
        />
        <ShutdownAll
          api={state.api}
          enabled={available(state, 'shutdown')}
          icon={<IconStopFill16 size={14} />}
          onReport={setNotice}
        />
      </div>

      <CapabilityNotices state={state} />

      {state.listing?.catalogError !== undefined ? (
        <p className={cls.empty}>{catalogUnreadableText(state.listing.catalogError)}</p>
      ) : entries.length === 0 ? (
        <p className={cls.empty}>{text.empty}</p>
      ) : view.groups.length === 0 ? (
        <p className={cls.empty}>{text.noMatch}</p>
      ) : (
        <div className={cls.list}>
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

      {status === undefined ? null : (
        <p className={cls.status} data-tone={state.report?.kind ?? 'ok'}>
          {status}
        </p>
      )}

      <Provenance state={state} />

      <div className={cls.foot}>
        <span className={cls.footInfo}>
          <span>{text.selectedCount(selectedCount)}</span>
          <Separator />
          <span>{text.totalSize(fileSizeText(state.listing?.totalSizeBytes ?? 0))}</span>
          {view.hidden === 0 ? null : (
            <>
              <Separator />
              <span>{text.hiddenBySearch(view.hidden)}</span>
            </>
          )}
        </span>
        <Button variant="ghost" size="sm" disabled={shown.length === 0} onClick={() => state.selectAll(shown)}>
          {text.selectAll}
        </Button>
        <Button variant="ghost" size="sm" disabled={selectedCount === 0} onClick={state.clearSelection}>
          {text.clearSelection}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedCount === 0 || state.busy || !available(state, 'unarchive')}
          onClick={() => {
            setNotice(undefined)
            void state.unarchive()
          }}
        >
          {text.unarchive}
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<IconTrashOutline16 size={14} />}
          disabled={selectedCount === 0 || state.busy || !available(state, 'delete')}
          onClick={() => {
            setConfirming(true)
          }}
        >
          {text.deleteAction}
        </Button>
      </div>

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
    </>
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
    <section className={cls.group}>
      <header className={cls.groupHead}>
        {group.workspaceId === undefined ? null : (
          <span className={cls.groupIcon}>
            <IconFolderClose16 size={13} />
          </span>
        )}
        <span className={cls.groupName}>{label}</span>
        <span className={cls.groupCount}>{text.groupSummary(group.entries.length, fileSizeText(group.sizeBytes))}</span>
      </header>
      <ul className={cls.rows}>
        {group.entries.map((entry) => (
          <ArchiveRow
            key={entry.id}
            entry={entry}
            now={now}
            selected={selected.has(entry.id)}
            onToggle={() => {
              onToggle(entry.id)
            }}
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
  // Relative time reads faster in a list, so the row carries the three facts
  // the archive area is for — when it started, when it was last touched, how
  // much disk it holds — and everything a user only wants once they have
  // singled a row out goes into the hover: the exact stamps, the session id
  // behind a title, and the directory the group header already implies.
  const detail = [
    `${text.createdAt} ${new Date(entry.createdAt).toLocaleString()}`,
    `${text.lastActivityAt} ${new Date(activity).toLocaleString()}`,
    entry.id,
    ...(entry.cwd === undefined ? [] : [entry.cwd]),
  ].join('\n')
  return (
    <li className={cls.row} data-selected={String(selected)}>
      <label className={cls.rowLabel} title={detail}>
        <input className={cls.check} type="checkbox" checked={selected} onChange={onToggle} />
        <span className={cls.rowTitle}>{entryLabel(entry)}</span>
        <span className={cls.rowMeta}>
          <span>
            {text.createdAt} {relativeText(relativeTime(entry.createdAt, now))}
          </span>
          <Separator />
          <span>
            {text.lastActivityAt} {relativeText(relativeTime(activity, now))}
          </span>
          <Separator />
          <span>{entry.sizeBytes === undefined ? text.unknownSize : fileSizeText(entry.sizeBytes)}</span>
        </span>
      </label>
    </li>
  )
}

/** Whether a capability is on; unknown capabilities are treated as on. */
function available(state: ArchiveState, id: CapabilityId): boolean {
  return state.capabilities?.capabilities[id].available ?? true
}

/**
 * What the list is worth trusting, on one quiet line.
 *
 * Three facts that matter only when something is off — a projection cache that
 * could not supply titles, archive-set members the backend no longer has, and
 * which backend answered at all. They are the first thing to ask for when a
 * row looks wrong, and noise every other minute of the panel's life, so they
 * sit at caption size under everything else rather than competing with it.
 */
function Provenance({ state }: { state: ArchiveState }): JSX.Element | null {
  const listing = state.listing
  if (listing === undefined) return null
  const parts = [
    ...(listing.degraded ? [text.degradedMetadata] : []),
    ...(listing.unresolved.length === 0 ? [] : [`${String(listing.unresolved.length)} ${text.unresolvedNotice}`]),
    ...(state.capabilities === undefined
      ? []
      : [`${text.backend}: ${state.capabilities.persistenceBackend} · v${state.capabilities.version}`]),
  ]
  if (parts.length === 0) return null
  return <p className={cls.provenance}>{parts.join('　')}</p>
}

/**
 * Why a button is switched off.
 *
 * Rendered as plain rows rather than a list: the panel's only `<li>` elements
 * are archived sessions, and a notice that counted as one would make "how many
 * rows are on screen" mean two different things.
 */
function CapabilityNotices({ state }: { state: ArchiveState }): JSX.Element | null {
  const report = state.capabilities?.capabilities
  if (report === undefined) return null
  const blocked = (['unarchive', 'delete', 'shutdown'] as const)
    .map((id) => ({ id, status: report[id] }))
    .filter((entry) => !entry.status.available)
  if (blocked.length === 0) return null
  return (
    <div className={cls.notices}>
      {blocked.map(({ id, status }) => (
        <div key={id} className={cls.notice}>
          <IconWarningOutline16 size={13} />
          <span>{status.code === undefined ? id : blockText(status.code)}</span>
          {status.subject === undefined ? null : <code className={cls.noticeSubject}>{status.subject}</code>}
        </div>
      ))}
    </div>
  )
}
