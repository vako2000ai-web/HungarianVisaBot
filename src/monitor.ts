import { nextSessionAlert } from "./session.js";
import type { StateStore } from "./state.js";
import type { BotEvent, CheckResult, SessionState } from "./types.js";

export const FAILURE_ALERT_STREAK = 5;
export const FAILURE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export interface MonitorDeps {
  check: () => Promise<CheckResult>;
  store: StateStore;
  emit: (e: BotEvent) => Promise<void> | void;
  now?: () => Date;
}

export interface TickOutcome {
  blocked: boolean;
}

/** Turns raw check results into state changes and events. No I/O besides injected deps. */
export class Monitor {
  private readonly now: () => Date;

  constructor(private readonly d: MonitorDeps) {
    this.now = d.now ?? (() => new Date());
  }

  get paused(): boolean {
    return this.d.store.get().paused;
  }

  async tick(): Promise<TickOutcome> {
    if (this.paused) return { blocked: false };
    return this.runCheck();
  }

  /** Manual /check: runs even while paused. */
  async checkNow(): Promise<TickOutcome> {
    return this.runCheck();
  }

  private async runCheck(): Promise<TickOutcome> {
    let result: CheckResult;
    try {
      result = await this.d.check();
    } catch (e) {
      result = { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
    const at = this.now().toISOString();
    this.d.store.update({ lastCheckAt: at, lastResult: describe(result) });

    switch (result.kind) {
      case "status":
        return this.onStatus(result.status, at);
      case "session":
        return this.onSession(result.state);
      case "config_error":
        await this.onConfigError(result.message);
        return { blocked: false };
      case "error":
        await this.onUnknown(result.message);
        return { blocked: false };
    }
  }

  private async onStatus(status: "NO_SLOTS" | "SLOTS_AVAILABLE" | "UNKNOWN", at: string): Promise<TickOutcome> {
    if (status === "UNKNOWN") {
      await this.onUnknown("страница не распознана");
      return { blocked: false };
    }
    const s = this.d.store.get();
    await this.applySession("ok");
    this.d.store.update({ unknownStreak: 0, blockedStreak: 0, lastConfigErrorAlerted: undefined });
    if (s.status !== status) {
      this.d.store.update({ status });
      // first observation of "no slots" is not news; first observation of slots is
      if (status === "SLOTS_AVAILABLE") await this.d.emit({ type: "slots_available", at });
      else if (s.status === "SLOTS_AVAILABLE") await this.d.emit({ type: "slots_gone", at });
    }
    return { blocked: false };
  }

  private async onSession(state: Exclude<SessionState, "ok">): Promise<TickOutcome> {
    if (state === "blocked") {
      const streak = this.d.store.get().blockedStreak + 1;
      this.d.store.update({ blockedStreak: streak });
      if (streak === 1) await this.d.emit({ type: "blocked" });
      return { blocked: true };
    }
    await this.applySession(state);
    return { blocked: false };
  }

  private async applySession(state: SessionState): Promise<void> {
    const s = this.d.store.get();
    const step = nextSessionAlert(s.sessionAlerted, state);
    if (step.alerted !== s.sessionAlerted) this.d.store.update({ sessionAlerted: step.alerted });
    if (step.event === "alert" && (state === "login_required" || state === "challenge")) {
      await this.d.emit({ type: "session_required", reason: state });
    } else if (step.event === "restored") {
      await this.d.emit({ type: "session_restored" });
    }
  }

  private async onUnknown(reason: string): Promise<void> {
    const s = this.d.store.get();
    const streak = s.unknownStreak + 1;
    this.d.store.update({ unknownStreak: streak });
    if (streak < FAILURE_ALERT_STREAK) return;
    const last = s.lastFailureAlertAt ? Date.parse(s.lastFailureAlertAt) : 0;
    if (this.now().getTime() - last < FAILURE_ALERT_COOLDOWN_MS) return;
    this.d.store.update({ lastFailureAlertAt: this.now().toISOString() });
    await this.d.emit({ type: "persistent_failure", streak, reason });
  }

  private async onConfigError(message: string): Promise<void> {
    if (this.d.store.get().lastConfigErrorAlerted === message) return;
    this.d.store.update({ lastConfigErrorAlerted: message });
    await this.d.emit({ type: "config_error", message });
  }

  pause(): void {
    this.d.store.update({ paused: true });
  }

  resume(): void {
    this.d.store.update({ paused: false });
  }
}

function describe(r: CheckResult): string {
  switch (r.kind) {
    case "status":
      return r.status;
    case "session":
      return `session:${r.state}`;
    case "config_error":
      return `config_error:${r.message}`;
    case "error":
      return `error:${r.message}`;
  }
}
