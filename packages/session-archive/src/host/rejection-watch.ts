/**
 * Attribution for the one failure mode teardown cannot contain.
 *
 * DSH installs a process-wide `unhandledRejection` handler that writes
 * `dsh: fatal load failure:` and exits(1). Any unhandled rejection anywhere
 * kills the harness, and a plugin cannot veto that: the handler was registered
 * at boot, it exits unconditionally, and its one exemption list is private.
 *
 * That matters here more than anywhere else in this plugin. DSH offers no way
 * to stop an agent by id, so teardown drives host machinery through a
 * transition its own authors never exercise, and a promise stranded in there
 * takes the whole harness down with it. Nothing in this module prevents that —
 * it makes it legible: the exit is preceded by a line naming the session whose
 * teardown was in progress, instead of a bare stack from a fiber the user has
 * no way to connect to a button they pressed.
 *
 * The listener is prepended so the diagnostic is written before DSH's handler
 * reaches its `exit`, and removed as soon as the batch ends: outside a
 * teardown this plugin has no business observing the process at all.
 */

/** The slice of `process` this module touches; tests substitute a fake. */
export interface ProcessLike {
  prependListener(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
}

/** The log surface this module writes to. */
export interface RejectionLogger {
  error(message: string): void
}

/** What the plugin was doing when a rejection surfaced. */
export type SubjectReader = () => string

/**
 * Run a teardown batch with unhandled rejections attributed to it.
 *
 * @param operation - the batch; its own failures are its own business and are
 *   not touched here.
 * @param subject - reads what is being torn down right now, evaluated when a
 *   rejection surfaces rather than captured up front.
 * @param logger - where the diagnostic goes.
 * @param proc - the process to observe.
 * @returns whatever the operation returned.
 */
export async function watchingRejections<T>(
  operation: () => Promise<T>,
  subject: SubjectReader,
  logger: RejectionLogger,
  proc: ProcessLike = process,
): Promise<T> {
  const listener = (reason: unknown): void => {
    const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    logger.error(
      `session-archive: unhandled rejection while tearing down ${subject()}; ` +
        `DSH treats any unhandled rejection as fatal and is about to exit.\n${detail}`,
    )
  }
  proc.prependListener('unhandledRejection', listener)
  try {
    return await operation()
  } finally {
    proc.off('unhandledRejection', listener)
  }
}
