/**
 * Whether one session is holding a live agent, as the host sees it.
 *
 * The session list carries a `running` bit, but it answers a narrower
 * question: whether a turn is in flight. An idle agent still holds its model
 * client, its tools and its log handles, and releasing those is the entire
 * point of closing one — so a button gated on the list's bit would hide
 * exactly in the case the user needs it. Only the host knows which sessions
 * have an agent at all, and `running()` is where it says so.
 *
 * There is no push channel for that population, so this probes instead of
 * subscribing, on the edges where the answer can have changed.
 */

import { useEffect, useState } from 'react'

import type { ArchiveApi } from '../transport/archive-api.js'

/**
 * Track one session's agent.
 *
 * @param api - the bound endpoint set.
 * @param sessionId - the session in question.
 * @param midTurn - the session list's `running` bit. A turn in flight means
 *   an agent exists, so this is an answer in its own right; it also moves on
 *   both edges where the population changes (a turn starting may have just
 *   resumed the session), which makes it the re-probe trigger as well.
 * @param epoch - bumped by the caller whenever it closes something, so the
 *   probe re-runs against the population its own action just changed.
 * @returns whether an agent is alive for this session.
 */
export function useRunningAgent(api: ArchiveApi, sessionId: string, midTurn: boolean, epoch: number): boolean {
  const [probed, setProbed] = useState(false)

  useEffect(() => {
    let abandoned = false
    void (async () => {
      const outcome = await api.running({})
      // A probe that never reached the host is not evidence of absence; a
      // button that vanishes on a dropped connection reads as the agent
      // having stopped, which is the one thing it must not imply.
      if (abandoned || !outcome.ok) return
      setProbed(outcome.value.sessions.some((session) => session.id === sessionId))
    })()
    return () => {
      abandoned = true
    }
  }, [api, sessionId, midTurn, epoch])

  return midTurn || probed
}
