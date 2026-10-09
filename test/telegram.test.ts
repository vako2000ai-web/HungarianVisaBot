import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerHandlers } from "../src/bot.js";
import { Monitor } from "../src/monitor.js";
import { Notifier, formatEvent, BOOKING_URL } from "../src/notifier.js";
import { StateStore } from "../src/state.js";
import type { CheckResult } from "../src/types.js";

const OWNER = 111;

function harness(opts: { now?: () => Date } = {}) {
  const store = new StateStore(join(mkdtempSync(join(tmpdir(), "vfs-")), "s.json"));
  const results: CheckResult[] = [];
  const monitor = new Monitor({
    store,
    check: async () => results.shift() ?? { kind: "status", status: "NO_SLOTS" },
    emit: () => {},
  });
  const bot = new Bot("123456:TESTTOKEN", {
    botInfo: { id: 1, is_bot: true, first_name: "t", username: "t", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false },
  });
  const sent: string[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "sendMessage") sent.push((payload as { text: string }).text);
    return { ok: true, result: true } as never;
  });
  registerHandlers(bot, { allowedUserIds: [OWNER], monitor, store, category: "short term visa C", now: opts.now });
  const say = (from: number, text: string) =>
    bot.handleUpdate({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1, date: 0, chat: { id: from, type: "private", first_name: "x" },
        from: { id: from, is_bot: false, first_name: "x" }, text,
        entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
      },
    });
  return { say, sent, store, monitor, results };
}

describe("whitelist", () => {
  it("ignores commands from strangers and reveals nothing", async () => {
    const h = harness();
    await h.say(999, "/status");
    await h.say(999, "/pause");
    expect(h.sent).toEqual([]);
    expect(h.monitor.paused).toBe(false);
  });
});

describe("commands", () => {
  it("/status reports status, last check and session", async () => {
    const h = harness();
    h.store.update({ status: "NO_SLOTS", lastCheckAt: "2026-10-09T10:00:00Z" });
    await h.say(OWNER, "/status");
    expect(h.sent[0]).toMatch(/слотов нет/);
    expect(h.sent[0]).toMatch(/2026-10-09T10:00:00Z/);
    expect(h.sent[0]).toMatch(/Сессия: ок/);
  });
  it("/pause then /resume toggles monitoring", async () => {
    const h = harness();
    await h.say(OWNER, "/pause");
    expect(h.monitor.paused).toBe(true);
    await h.say(OWNER, "/resume");
    expect(h.monitor.paused).toBe(false);
  });
  it("/check runs a check and replies with the status", async () => {
    const h = harness();
    h.results.push({ kind: "status", status: "SLOTS_AVAILABLE" });
    await h.say(OWNER, "/check");
    expect(h.store.get().status).toBe("SLOTS_AVAILABLE");
    expect(h.sent.at(-1)).toMatch(/слоты ЕСТЬ/);
  });
  it("/check within 60s of the last check is refused without checking", async () => {
    const now = new Date("2026-10-09T10:00:30Z");
    const h = harness({ now: () => now });
    h.store.update({ lastCheckAt: "2026-10-09T10:00:00Z" });
    h.results.push({ kind: "status", status: "SLOTS_AVAILABLE" });
    await h.say(OWNER, "/check");
    expect(h.sent[0]).toMatch(/Слишком рано.*30/);
    expect(h.store.get().status).toBeUndefined();
  });
});

describe("Notifier", () => {
  it("sends to every allowed user", async () => {
    const calls: Array<[number, string]> = [];
    const n = new Notifier({ userIds: [1, 2], send: async (c, t) => void calls.push([c, t]) });
    await n.broadcast("hi");
    expect(calls).toEqual([[1, "hi"], [2, "hi"]]);
  });
  it("retries a failing delivery with backoff and succeeds", async () => {
    let fails = 2;
    const delays: number[] = [];
    const calls: string[] = [];
    const n = new Notifier({
      userIds: [1],
      sleep: async (ms) => void delays.push(ms),
      send: async (_c, t) => {
        if (fails-- > 0) throw new Error("telegram down");
        calls.push(t);
      },
    });
    await n.broadcast("x");
    expect(calls).toEqual(["x"]);
    expect(delays).toEqual([1000, 2000]);
    expect(n.pending).toBe(0);
  });
  it("keeps the event in the outbox when Telegram stays down, and delivers on the next flush", async () => {
    let down = true;
    const calls: string[] = [];
    const n = new Notifier({
      userIds: [1],
      attempts: 2,
      sleep: async () => {},
      send: async (_c, t) => {
        if (down) throw new Error("down");
        calls.push(t);
      },
    });
    await n.broadcast("slots!");
    expect(n.pending).toBe(1);
    down = false;
    await n.flush();
    expect(calls).toEqual(["slots!"]);
    expect(n.pending).toBe(0);
  });
});

describe("formatEvent", () => {
  it("slots_available contains category, time and the booking link", () => {
    const t = formatEvent({ type: "slots_available", at: "2026-10-09T10:00:00Z" }, "short term visa C");
    expect(t).toContain("short term visa C");
    expect(t).toContain("2026-10-09T10:00:00Z");
    expect(t).toContain(BOOKING_URL);
    expect(BOOKING_URL).toBe("https://services.vfsglobal.by/blr/ru/hun/application-detail");
  });
});
