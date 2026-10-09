import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Monitor } from "../src/monitor.js";
import { StateStore } from "../src/state.js";
import type { BotEvent, CheckResult } from "../src/types.js";

function setup(file = join(mkdtempSync(join(tmpdir(), "vfs-")), "state.json")) {
  const events: BotEvent[] = [];
  let clock = new Date("2026-10-09T10:00:00Z");
  const queue: CheckResult[] = [];
  const store = new StateStore(file);
  const m = new Monitor({
    store,
    check: async () => queue.shift() ?? { kind: "error", message: "empty" },
    emit: (e) => void events.push(e),
    now: () => clock,
  });
  return {
    m, events, store, file, queue,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}
const st = (status: "NO_SLOTS" | "SLOTS_AVAILABLE" | "UNKNOWN"): CheckResult => ({ kind: "status", status });

describe("Monitor status changes", () => {
  it("notifies NO_SLOTS -> SLOTS_AVAILABLE, then slots_gone", async () => {
    const t = setup();
    t.queue.push(st("NO_SLOTS"), st("SLOTS_AVAILABLE"), st("SLOTS_AVAILABLE"), st("NO_SLOTS"));
    for (let i = 0; i < 4; i++) await t.m.tick();
    expect(t.events.map((e) => e.type)).toEqual(["slots_available", "slots_gone"]);
  });
  it("does not notify when NO_SLOTS repeats", async () => {
    const t = setup();
    t.queue.push(st("NO_SLOTS"), st("NO_SLOTS"));
    await t.m.tick();
    await t.m.tick();
    expect(t.events).toEqual([]);
  });
  it("notifies when slots are present on the very first check", async () => {
    const t = setup();
    t.queue.push(st("SLOTS_AVAILABLE"));
    await t.m.tick();
    expect(t.events.map((e) => e.type)).toEqual(["slots_available"]);
  });
  it("UNKNOWN does not change the last known status", async () => {
    const t = setup();
    t.queue.push(st("NO_SLOTS"), st("UNKNOWN"), st("NO_SLOTS"));
    for (let i = 0; i < 3; i++) await t.m.tick();
    expect(t.store.get().status).toBe("NO_SLOTS");
    expect(t.events).toEqual([]);
  });
  it("does not re-notify the same status after a restart", async () => {
    const t = setup();
    t.queue.push(st("SLOTS_AVAILABLE"));
    await t.m.tick();
    const t2 = setup(t.file);
    t2.queue.push(st("SLOTS_AVAILABLE"));
    await t2.m.tick();
    expect(t2.events).toEqual([]);
  });
});

describe("Monitor failures and session", () => {
  it("alerts once after 5 UNKNOWN in a row, then at most hourly", async () => {
    const t = setup();
    for (let i = 0; i < 12; i++) t.queue.push(st("UNKNOWN"));
    for (let i = 0; i < 12; i++) await t.m.tick();
    expect(t.events.filter((e) => e.type === "persistent_failure")).toHaveLength(1);
    t.advance(61 * 60 * 1000);
    t.queue.push(st("UNKNOWN"));
    await t.m.tick();
    expect(t.events.filter((e) => e.type === "persistent_failure")).toHaveLength(2);
  });
  it("sends one session_required and one session_restored", async () => {
    const t = setup();
    t.queue.push(
      { kind: "session", state: "login_required" },
      { kind: "session", state: "login_required" },
      st("NO_SLOTS"),
    );
    for (let i = 0; i < 3; i++) await t.m.tick();
    expect(t.events.map((e) => e.type)).toEqual(["session_required", "session_restored"]);
  });
  it("reports blocked and signals backoff", async () => {
    const t = setup();
    t.queue.push({ kind: "session", state: "blocked" });
    const out = await t.m.tick();
    expect(out.blocked).toBe(true);
    expect(t.store.get().blockedStreak).toBe(1);
  });
  it("announces a block once per streak and resets after a good check", async () => {
    const t = setup();
    t.queue.push(
      { kind: "session", state: "blocked" },
      { kind: "session", state: "blocked" },
      st("NO_SLOTS"),
      { kind: "session", state: "blocked" },
    );
    for (let i = 0; i < 4; i++) await t.m.tick();
    expect(t.events.filter((e) => e.type === "blocked")).toHaveLength(2);
  });
  it("alerts a config error only once per message", async () => {
    const t = setup();
    t.queue.push(
      { kind: "config_error", message: "no category" },
      { kind: "config_error", message: "no category" },
    );
    await t.m.tick();
    await t.m.tick();
    expect(t.events.filter((e) => e.type === "config_error")).toHaveLength(1);
  });
  it("paused monitor does not check; checkNow still does", async () => {
    const t = setup();
    t.m.pause();
    t.queue.push(st("SLOTS_AVAILABLE"));
    await t.m.tick();
    expect(t.events).toEqual([]);
    await t.m.checkNow();
    expect(t.events.map((e) => e.type)).toEqual(["slots_available"]);
  });
});
