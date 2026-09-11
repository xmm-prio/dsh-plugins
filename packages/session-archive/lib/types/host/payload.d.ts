/**
 * Request-payload narrowing for the endpoint layer.
 *
 * The envelope decoder hands over `payload` as `unknown` because that is what
 * arrived over the wire. Narrowing lives here rather than in the transport so
 * the transport stays ignorant of what any endpoint means, and so a malformed
 * request produces the same structured failure envelope as any other refusal.
 */
/** Raised for a payload that does not carry what the endpoint needs. */
export declare class PayloadError extends Error {
    constructor(message: string);
}
/** Read a required array-of-strings field. */
export declare function readStringArray(payload: unknown, key: string): readonly string[];
/** Read a required non-empty string field. */
export declare function readString(payload: unknown, key: string): string;
