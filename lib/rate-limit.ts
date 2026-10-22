import "server-only";

// In-memory limiter for login attempts. Fine for a single app instance on one VPS.
// Everyone at the shop shares one IP address, so the per-IP limit is loose (it
// only stops automated guessing) and the per-username limit is the strict one.

const WINDOW_MS = 15 * 60 * 1000;

export type LimitKey = { key: string; max: number };

export function loginLimitKeys(ip: string, username: string): LimitKey[] {
  return [
    { key: `user:${username}`, max: 5 },
    { key: `ip:${ip}`, max: 30 },
  ];
}

type Entry = { failures: number; firstFailureAt: number };

const entries = new Map<string, Entry>();

function current(key: string, now: number): Entry | undefined {
  const entry = entries.get(key);
  if (entry && now - entry.firstFailureAt > WINDOW_MS) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

/** Minutes until these keys may try again, or 0 when none is blocked. */
export function blockedMinutes(keys: LimitKey[], now = Date.now()): number {
  let waitMs = 0;
  for (const { key, max } of keys) {
    const entry = current(key, now);
    if (entry && entry.failures >= max) {
      waitMs = Math.max(waitMs, entry.firstFailureAt + WINDOW_MS - now);
    }
  }
  return Math.ceil(waitMs / 60000);
}

export function recordFailure(keys: LimitKey[], now = Date.now()) {
  for (const { key } of keys) {
    const entry = current(key, now);
    if (entry) entry.failures += 1;
    else entries.set(key, { failures: 1, firstFailureAt: now });
  }
}

/** After a successful login, only that username's failures are cleared. */
export function clearFailures(keys: LimitKey[]) {
  for (const { key } of keys) {
    if (key.startsWith("user:")) entries.delete(key);
  }
}
