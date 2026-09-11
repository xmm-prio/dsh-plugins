/**
 * The two value formatters the archive area needs, owned outright.
 *
 * Both of these also exist in `@deepseek-ai/dsh-client-ui-primitives`, and
 * this plugin used to import them from there so that its rows would read
 * exactly like the host's own. That coupling was a bad trade and took the
 * whole panel down once already.
 *
 * The primitives specifier is not a plugin module the loader fetches: it is
 * seeded into the browser's `require` from the host's *application* bundle,
 * so what it carries is whatever survived that bundle's tree-shaking on that
 * particular DSH build. Components have to come from there — nothing else can
 * make a button look native — but a byte count and a date difference are pure
 * arithmetic with no host state behind them, and borrowing them bought a
 * cosmetic guarantee at the price of a hard runtime dependency on a surface
 * with no contract. When `fileSizeText` stopped being exposed, the panel threw
 * during render and the host's slot boundary unmounted the entire archive
 * area, which a user experiences as a panel that flashes and vanishes.
 *
 * The rule this file draws: depend on the host for what must look native,
 * never for what can be computed. The arithmetic below deliberately matches
 * the host's to the digit, so the two surfaces still agree — but it agrees by
 * construction now, and a build that drops the export changes nothing here.
 */
/** Relative-time bucket of a dated row's trailing label. */
export type RelativeTimeUnit = 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years';
/** Structured relative time: the bucket plus its magnitude (0 for 'now'). */
export interface RelativeTime {
    readonly unit: RelativeTimeUnit;
    readonly n: number;
}
/**
 * Byte count as compact size text (`312B`, `4.2KB`, `1.5MB`, `2.4GB`).
 *
 * One decimal below ten of the chosen unit, whole numbers above it.
 *
 * @param bytes - exact byte count.
 * @returns the size, in the largest unit that leaves a value under 1024.
 */
export declare function fileSizeText(bytes: number): string;
/**
 * Compact relative time, as a bucket for the dictionary to put words to.
 *
 * Returns a bucket rather than a string because the words belong to this
 * plugin's own dictionary in `text.ts` — the split the host draws too.
 *
 * @param at - epoch ms of the dated moment.
 * @param now - current epoch ms, passed in so rendering stays pure.
 * @returns the bucket and its magnitude; a future stamp reads as `now`.
 */
export declare function relativeTime(at: number, now: number): RelativeTime;
