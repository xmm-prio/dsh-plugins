/**
 * Pull in the host packages' `declare module '@deepseek-ai/cordis'`
 * augmentations so `ctx.connection`, `ctx.workspaceRegistry`, and
 * `ctx.sessionPersistence` are typed.
 *
 * Type-only, on purpose. A *value* import of any `@deepseek-ai/*` package would
 * be a runtime dependency, and this plugin is loaded from outside the profile's
 * module tree: the specifier would either fail to resolve or resolve to a second
 * physical copy, splitting the Service and Context class identities the whole
 * harness is built on. Every host package here is a peer + dev dependency and
 * contributes nothing to the built bundle.
 */

import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
