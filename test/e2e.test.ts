import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VfsChecker } from "../src/browser.js";
import { loadConfig } from "../src/config.js";
import { Monitor } from "../src/monitor.js";
import { StateStore } from "../src/state.js";
import type { BotEvent } from "../src/types.js";
import { startPortal, type PortalMode } from "./stub/portal.js";

const CHROME = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = existsSync(CHROME) ? describe : describe.skip;

run("end-to-end against the local portal stub (real Chromium)", () => {
  let portal: Awaited<ReturnType<typeof startPortal>>;
  let checker: VfsChecker;
  const dir = mkdtempSync(join(tmpdir(), "vfs-e2e-"));
  const cfgFor = (extra: Record<string, string> = {}) =>
    loadConfig({
      TELEGRAM_BOT_TOKEN: "t", ALLOWED_USER_IDS: "1",
      VFS_BASE_URL: portal.url, PROFILE_DIR: join(dir, "profile"),
      STATE_FILE: join(dir, "state.json"), CHROMIUM_PATH: CHROME, ...extra,
    });

  beforeAll(async () => {
    portal = await startPortal();
    checker = new VfsChecker(cfgFor());
  });
  afterAll(async () => {
    await checker.close();
    portal.server.close();
  });

  const check = (mode: PortalMode) => {
    portal.setMode(mode);
    return checker.check();
  };

  it("reports NO_SLOTS, SLOTS_AVAILABLE, and session problems", async () => {
    expect(await check("noslots")).toEqual({ kind: "status", status: "NO_SLOTS" });
    expect(await check("slots")).toEqual({ kind: "status", status: "SLOTS_AVAILABLE" });
    expect(await check("login")).toEqual({ kind: "session", state: "login_required" });
    expect(await check("challenge")).toEqual({ kind: "session", state: "challenge" });
    expect(await check("blocked")).toEqual({ kind: "session", state: "blocked" });
  }, 120_000);

  it("returns config_error when the configured category is missing", async () => {
    const bad = new VfsChecker(cfgFor({ VFS_CATEGORY: "no such category", PROFILE_DIR: join(dir, "p2") }));
    portal.setMode("noslots");
    const r = await bad.check();
    await bad.close();
    expect(r.kind).toBe("config_error");
    if (r.kind === "config_error") expect(r.message).toMatch(/no such category/);
  }, 60_000);

  it("no slots -> slots yields exactly one notification", async () => {
    const events: BotEvent[] = [];
    const store = new StateStore(join(dir, "e2e-state.json"));
    const m = new Monitor({ store, check: () => checker.check(), emit: (e) => void events.push(e) });
    portal.setMode("noslots");
    await m.tick();
    await m.tick();
    portal.setMode("slots");
    await m.tick();
    await m.tick();
    expect(events.map((e) => e.type)).toEqual(["slots_available"]);
  }, 120_000);
});
