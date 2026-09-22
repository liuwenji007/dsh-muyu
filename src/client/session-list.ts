/**
 * Current session on the root sessions list.
 * Hosts through 0.1.6 publish it as `current`. From 0.1.7 the list has no
 * `current`; the open session is the row whose `retainedBy.mainView` is positive.
 */

/** Fields this plugin reads. Extra host fields are ignored. */
export type SessionListLike = {
  current?: unknown
  byId?: Readonly<Record<string, SessionRowLike | undefined>>
}

type SessionRowLike = {
  id?: unknown
  running?: unknown
  retainedBy?: { mainView?: unknown } | null
}

function sessionIdOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Id of the session the main view is showing.
 * @param list - root `useSessions` snapshot.
 * @returns the open session id, or undefined when none is open.
 */
export function currentSessionId(list: SessionListLike): string | undefined {
  const current = sessionIdOf(list.current)
  if (current !== undefined) return current
  const rows = list.byId
  if (rows === undefined) return undefined
  for (const session of Object.values(rows)) {
    const held = session?.retainedBy?.mainView
    const id = sessionIdOf(session?.id)
    if (typeof held === 'number' && held > 0 && id !== undefined) return id
  }
  return undefined
}

/**
 * Whether that session's agent is running.
 * @param list - root `useSessions` snapshot.
 */
export function currentSessionRunning(list: SessionListLike): boolean {
  const id = currentSessionId(list)
  if (id === undefined) return false
  return list.byId?.[id]?.running === true
}
