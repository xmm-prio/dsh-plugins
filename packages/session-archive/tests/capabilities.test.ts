import { describe, expect, it } from 'vitest'

import { probeCapabilities } from '../src/host/capabilities.js'
import type { HostSurfaces } from '../src/host/capabilities.js'

const EFFECT = Symbol.for('cordis.effect')

function healthyRegistry() {
  const disposer = Object.assign(() => {}, {})
  Object.defineProperty(disposer, EFFECT, { value: { label: 'agentLoop.lifecycle(a)', children: [] } })
  return { values: () => [{ fibers: [{ _disposables: [disposer] }] }] }
}

function healthy(overrides: Partial<HostSurfaces> = {}): HostSurfaces {
  return {
    registry: healthyRegistry(),
    agents: { get: () => undefined, list: () => [], roots: () => [] },
    workspaceRegistry: {
      archivedSessionIds: [],
      archiveSession: async () => {},
      list: () => [],
      enqueueOperation: (operation: () => Promise<unknown>) => operation(),
      state: { archivedSessionIds: [] },
    } as never,
    persistence: {
      name: 'session-persistence-jsonl',
      list: async () => [],
      stat: async () => undefined,
      open: async () => ({}),
      resolveCurrentLog: async () => undefined,
    } as never,
    storageDomain: {
      get: () => ({ global: { get: () => ({ workspaceIds: [], archivedSessionIds: [] }), set: async () => {} } }),
    } as never,
    projectionCache: { cachedSnapshot: () => undefined },
    sessionRoot: { known: true, path: '/logs', source: 'backend-config' },
    ...overrides,
  }
}

describe('probeCapabilities', () => {
  it('enables everything on a healthy host', () => {
    const report = probeCapabilities(healthy())
    expect(Object.values(report).every((status) => status.available)).toBe(true)
  })

  it('names the missing archive API rather than reporting a generic failure', () => {
    const report = probeCapabilities(
      healthy({ workspaceRegistry: { archivedSessionIds: [], list: () => [] } as never }),
    )
    expect(report.archive).toEqual({
      available: false,
      code: 'archive-api-missing',
      subject: 'workspaceRegistry.archiveSession',
    })
  })

  it('cascades a blocked archive into unarchive and delete', () => {
    const report = probeCapabilities(healthy({ workspaceRegistry: undefined }))
    expect(report.archive.code).toBe('workspace-registry-unavailable')
    expect(report.unarchive.code).toBe('workspace-registry-unavailable')
    expect(report.delete.code).toBe('workspace-registry-unavailable')
  })

  it('disables only unarchive and delete when the private write path is gone', () => {
    const registry = { archivedSessionIds: [], archiveSession: async () => {}, list: () => [] }
    const report = probeCapabilities(healthy({ workspaceRegistry: registry as never }))
    expect(report.archive.available).toBe(true)
    expect(report.shutdown.available).toBe(true)
    expect(report.unarchive).toEqual({
      available: false,
      code: 'private-write-path-missing',
      subject: 'workspaceRegistry.enqueueOperation',
    })
    expect(report.delete.code).toBe('private-write-path-missing')
  })

  it('reports the same code but a different subject for either missing member', () => {
    const registry = {
      archivedSessionIds: [],
      archiveSession: async () => {},
      list: () => [],
      enqueueOperation: (operation: () => Promise<unknown>) => operation(),
    }
    const report = probeCapabilities(healthy({ workspaceRegistry: registry as never }))
    expect(report.unarchive).toEqual({
      available: false,
      code: 'private-write-path-missing',
      subject: 'workspaceRegistry.state',
    })
  })

  it('disables unarchive when the workspace storage domain is not open', () => {
    const report = probeCapabilities(healthy({ storageDomain: { get: () => undefined } as never }))
    expect(report.unarchive.code).toBe('workspace-domain-unavailable')
    expect(report.unarchive.subject).toContain('domain-not-open')
    expect(report.archive.available).toBe(true)
  })

  it('disables shutdown and delete when the fiber tree cannot be walked', () => {
    const report = probeCapabilities(healthy({ registry: { values: 'nope' } }))
    expect(report.shutdown).toEqual({ available: false, code: 'fiber-scan-unavailable', subject: 'ctx.registry fibers' })
    expect(report.delete.code).toBe('fiber-scan-unavailable')
    expect(report.archive.available).toBe(true)
    expect(report.unarchive.available).toBe(true)
  })

  it('refuses to delete from a persistence backend it does not know', () => {
    const report = probeCapabilities(
      healthy({
        persistence: { name: 'session-persistence-sqlite', list: async () => [], stat: async () => undefined, open: async () => ({}) } as never,
      }),
    )
    expect(report.delete).toEqual({
      available: false,
      code: 'persistence-backend-unsupported',
      subject: 'session-persistence-sqlite',
    })
    expect(report.archive.available).toBe(true)
    expect(report.metadata.available).toBe(true)
  })

  it('refuses to delete when the JSONL backend lost its log resolver', () => {
    const report = probeCapabilities(
      healthy({
        persistence: { name: 'session-persistence-jsonl', list: async () => [], stat: async () => undefined, open: async () => ({}) } as never,
      }),
    )
    expect(report.delete).toEqual({
      available: false,
      code: 'log-resolver-missing',
      subject: 'session-persistence-jsonl.resolveCurrentLog',
    })
  })

  it('degrades metadata alone when the projection cache is absent', () => {
    const report = probeCapabilities(healthy({ projectionCache: undefined }))
    expect(report.metadata).toEqual({
      available: false,
      code: 'projection-cache-unavailable',
      subject: 'sessionProjectionCache.cachedSnapshot',
    })
    expect(report.archive.available).toBe(true)
    expect(report.delete.available).toBe(true)
  })

  it('rejects a projection cache whose shape is broken rather than trusting the name', () => {
    const report = probeCapabilities(healthy({ projectionCache: { cachedSnapshot: 'not a function' } }))
    expect(report.metadata.available).toBe(false)
  })

  it('blocks only deleteLegacy when the session log root is unknown', () => {
    const report = probeCapabilities(
      healthy({ sessionRoot: { known: false, reason: 'nothing published a root' } }),
    )
    expect(report.delete.available).toBe(true)
    expect(report.deleteLegacy).toEqual({
      available: false,
      code: 'log-root-unknown',
      subject: 'nothing published a root',
    })
  })

  it('cascades a blocked delete into deleteLegacy', () => {
    const report = probeCapabilities(healthy({ registry: { values: 'nope' } }))
    expect(report.deleteLegacy.code).toBe('fiber-scan-unavailable')
  })

  it('never throws, whatever the host looks like', () => {
    const hostile = {
      get registry(): never {
        throw new Error('exploding surface')
      },
    } as unknown as HostSurfaces
    expect(() => probeCapabilities(hostile)).not.toThrow()
    expect(probeCapabilities(hostile).archive.code).toBe('probe-failed')
  })

  it('blocks everything with probe-failed when a surface throws mid-probe', () => {
    const angry = healthy({
      workspaceRegistry: {
        archiveSession: async () => {},
        list: () => [],
        get archivedSessionIds(): never {
          throw new Error('boom')
        },
      } as never,
    })
    const report = probeCapabilities(angry)
    expect(report.delete).toEqual({ available: false, code: 'probe-failed', subject: 'boom' })
  })
})
