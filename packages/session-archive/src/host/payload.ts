/**
 * Request-payload narrowing for the endpoint layer.
 *
 * The envelope decoder hands over `payload` as `unknown` because that is what
 * arrived over the wire. Narrowing lives here rather than in the transport so
 * the transport stays ignorant of what any endpoint means, and so a malformed
 * request produces the same structured failure envelope as any other refusal.
 */

/** Raised for a payload that does not carry what the endpoint needs. */
export class PayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadError'
  }
}

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new PayloadError('payload must be a JSON object')
  }
  return payload as Record<string, unknown>
}

/** Read a required array-of-strings field. */
export function readStringArray(payload: unknown, key: string): readonly string[] {
  const value = record(payload)[key]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new PayloadError(`payload.${key} must be an array of strings`)
  }
  return value as readonly string[]
}

/** Read a required non-empty string field. */
export function readString(payload: unknown, key: string): string {
  const value = record(payload)[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new PayloadError(`payload.${key} must be a non-empty string`)
  }
  return value
}
