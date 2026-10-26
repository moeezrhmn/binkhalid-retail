/** A session is valid only for an active user whose sessions have not been ended since login. */
export function sessionIsCurrent(
  user: { isActive: boolean; sessionVersion: number } | null,
  session: { ver: number },
): boolean {
  return Boolean(user && user.isActive && user.sessionVersion === session.ver);
}
