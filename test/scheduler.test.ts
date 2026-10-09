import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BACKOFF_FACTOR, Scheduler, nextDelayMs } from "../src/scheduler.js";

describe("nextDelayMs", () => {
  it("stays within ±20% of the interval and never below 60s*0.8 for a 60s interval", () => {
    expect(nextDelayMs(60, 0, () => 0)).toBe(48_000);
    expect(nextDelayMs(60, 0, () => 1)).toBe(72_000);
    expect(nextDelayMs(60, 0, () => 0.5)).toBe(60_000);
  });
  it("doubles per consecutive block and caps", () => {
    expect(nextDelayMs(100, 1, () => 0.5)).toBe(200_000);
    expect(nextDelayMs(100, 2, () => 0.5)).toBe(400_000);
    expect(nextDelayMs(100, 20, () => 0.5)).toBe(100_000 * MAX_BACKOFF_FACTOR);
  });
});

describe("Scheduler", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps ticking after a failing tick and stops on stop()", async () => {
    vi.useFakeTimers();
    let n = 0;
    const errors: unknown[] = [];
    const s = new Scheduler({
      intervalSec: 60,
      random: () => 0.5,
      getBlockedStreak: () => 0,
      onError: (e) => errors.push(e),
      tick: async () => {
        n++;
        if (n === 1) throw new Error("boom");
        return { blocked: false };
      },
    });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(n).toBe(2);
    expect(errors).toHaveLength(1);
    s.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(n).toBe(2);
  });
});
