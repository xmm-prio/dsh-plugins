/**
 * Plugin configuration.
 *
 * Exactly one item, and it is an escape hatch rather than a normal setting. The
 * delete path gets its directory from the persistence backend's own
 * `resolveCurrentLog`, so on a healthy host this is never needed; it exists for
 * the case where the backend will not name a path (a log left in an older
 * format generation) and as the containment root for the filesystem guard.
 *
 * Resist adding more. Anything else this plugin might want to vary is either
 * derivable from the host at runtime or belongs in the browser half's own UI.
 */
import Schema from '@deepseek-ai/schemastery';
/** Validated plugin configuration. */
export interface Config {
    /**
     * Absolute path of the session log root, when the deployment moved it away
     * from the backend's default. Leave unset unless a delete refuses with
     * `legacy-log-format`.
     */
    readonly sessionRoot?: string;
}
/** Schemastery schema; cordis validates and fills defaults before `apply` runs. */
export declare const Config: Schema<Config>;
