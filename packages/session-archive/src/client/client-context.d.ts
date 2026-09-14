/**
 * Pull in the UI renderer's `declare module '@deepseek-ai/cordis'`
 * augmentation so `ctx.slots` is typed. The slot *registry* type lives with the
 * renderer, while the slot *map* it keys into lives in
 * `@deepseek-ai/dsh-client-ui-slots`, so both are needed.
 *
 * The rest are the packages that merge the slots this plugin registers into,
 * and the standard props those slots hand their occupants: `-conversation`
 * declares the session header's utilities slot, `-session` declares the
 * `sessionId` seat a session-scoped occupant reads and the `useSessions`
 * selector every occupant gets.
 *
 * Type-only, all of them. This plugin reaches every one of these through
 * `ctx` or through props, never by importing a value, so none enters the
 * bundle — which is what keeps them out of `dsh.client.external`, where only
 * the specifiers the browser's `require` actually seeds may appear.
 */

import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
