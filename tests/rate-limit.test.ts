import { describe, expect, it } from "vitest";
import { blockedMinutes, clearFailures, loginLimitKeys, recordFailure } from "@/lib/rate-limit";

describe("login rate limit", () => {
  it("blocks a username after 5 failures, without blocking others on the same IP", () => {
    const now = Date.now();
    const attacker = loginLimitKeys("shop-ip", "ahmed");
    for (let i = 0; i < 5; i++) recordFailure(attacker, now);

    expect(blockedMinutes(attacker, now)).toBe(15);
    expect(blockedMinutes(loginLimitKeys("shop-ip", "admin"), now)).toBe(0);
  });

  it("blocks the whole IP only after 30 failures", () => {
    const now = Date.now();
    for (let i = 0; i < 29; i++) recordFailure(loginLimitKeys("bot-ip", `user${i}`), now);
    expect(blockedMinutes(loginLimitKeys("bot-ip", "admin"), now)).toBe(0);

    recordFailure(loginLimitKeys("bot-ip", "user29"), now);
    expect(blockedMinutes(loginLimitKeys("bot-ip", "admin"), now)).toBeGreaterThan(0);
  });

  it("unblocks after the 15 minute window", () => {
    const now = Date.now();
    const keys = loginLimitKeys("ip-2", "bilal");
    for (let i = 0; i < 5; i++) recordFailure(keys, now);
    expect(blockedMinutes(keys, now + 15 * 60 * 1000 + 1)).toBe(0);
  });

  it("a successful login clears that username's failures", () => {
    const now = Date.now();
    const keys = loginLimitKeys("ip-3", "sara");
    for (let i = 0; i < 4; i++) recordFailure(keys, now);
    clearFailures(keys);
    recordFailure(keys, now);
    expect(blockedMinutes(keys, now)).toBe(0);
  });
});
