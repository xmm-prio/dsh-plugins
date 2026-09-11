/** Construction of the per-session operation outcomes the contract carries. */
import type { FailureCode, OperationFailure, OperationOutcome } from '../contract.js';
/** A failed session-scoped operation. */
export declare function failure(id: string, code: FailureCode, detail: string): OperationFailure;
/** A successful session-scoped operation. */
export declare function success(id: string): OperationOutcome;
