/**
 * Pull in the UI renderer's `declare module '@deepseek-ai/cordis'`
 * augmentation so `ctx.slots` is typed. The slot *registry* type lives with the
 * renderer, while the slot *map* it keys into lives in
 * `@deepseek-ai/dsh-client-ui-slots`, so both are needed.
 *
 * Type-only. `@deepseek-ai/dsh-client-ui-slots` is one of the nine specifiers
 * the browser's `require` seeds unconditionally, but this plugin only ever
 * reaches the registry through `ctx`, so neither package enters the bundle.
 */

import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
