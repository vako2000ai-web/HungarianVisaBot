import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { TELEGRAM_BOT_TOKEN: "t", ALLOWED_USER_IDS: "1, 2" };

describe("loadConfig", () => {
  it("applies defaults for the Minsk / short term visa C / 90 days category", () => {
    const c = loadConfig(base);
    expect(c.center).toBe("Hungary Visa Application Center, Minsk");
    expect(c.category).toBe("short term visa C");
    expect(c.subcategory).toBe("Short-Term VISA 90 days");
    expect(c.intervalSec).toBe(180);
    expect(c.allowedUserIds).toEqual([1, 2]);
    expect(c.headed).toBe(false);
  });

  it("allows overriding the category", () => {
    const c = loadConfig({ ...base, VFS_CATEGORY: "other" });
    expect(c.category).toBe("other");
  });

  it("rejects an interval below 60 seconds", () => {
    expect(() => loadConfig({ ...base, CHECK_INTERVAL_SEC: "30" })).toThrow(/>= 60/);
  });

  it("accepts the 60 second boundary", () => {
    expect(loadConfig({ ...base, CHECK_INTERVAL_SEC: "60" }).intervalSec).toBe(60);
  });

  it("requires token and allowed users", () => {
    expect(() => loadConfig({})).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "t" })).toThrow(/ALLOWED_USER_IDS/);
  });

  it("rejects non-numeric user ids", () => {
    expect(() => loadConfig({ ...base, ALLOWED_USER_IDS: "abc" })).toThrow(/numeric/);
  });
});
