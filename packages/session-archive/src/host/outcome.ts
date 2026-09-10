/** Construction of the per-session operation outcomes the contract carries. */

import type { FailureCode, OperationFailure, OperationOutcome } from '../contract.js'

/** A failed session-scoped operation. */
export function failure(id: string, code: FailureCode, detail: string): OperationFailure {
  return { id, ok: false, code, detail }
}

/** A successful session-scoped operation. */
export function success(id: string): OperationOutcome {
  return { id, ok: true }
}
