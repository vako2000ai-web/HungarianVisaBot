import { describe, expect, it } from "vitest";
import { detectSessionState, nextSessionAlert } from "../src/session.js";
import { fixture } from "./helpers.js";

describe("detectSessionState", () => {
  it("ok for a normal portal page", () => {
    expect(detectSessionState(fixture("no_slots"))).toBe("ok");
    expect(detectSessionState(fixture("slots_available"))).toBe("ok");
  });
  it("login_required on redirect to /login even though the login page has a Cloudflare widget", () => {
    expect(detectSessionState(fixture("login_redirect"))).toBe("login_required");
  });
  it("challenge when Cloudflare asks for a human", () => {
    expect(detectSessionState(fixture("cloudflare_challenge"))).toBe("challenge");
  });
  it("blocked on 429 / rate limit text", () => {
    expect(detectSessionState(fixture("blocked"))).toBe("blocked");
  });
});

describe("nextSessionAlert", () => {
  it("alerts once, stays silent while broken, confirms on recovery", () => {
    let alerted = false;
    const events: Array<string | null> = [];
    for (const st of ["login_required", "login_required", "challenge", "ok", "ok"] as const) {
      const step = nextSessionAlert(alerted, st);
      alerted = step.alerted;
      events.push(step.event);
    }
    expect(events).toEqual(["alert", null, null, "restored", null]);
  });
  it("blocked does not count as a session loss", () => {
    expect(nextSessionAlert(false, "blocked")).toEqual({ alerted: false, event: null });
  });
});
