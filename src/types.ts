export type SlotStatus = "NO_SLOTS" | "SLOTS_AVAILABLE" | "UNKNOWN";

/** What we read from the page; all classification works on this, not on the DOM. */
export interface PageSnapshot {
  url: string;
  httpStatus?: number;
  /** document.body.innerText */
  text: string;
  /** null when the "Продолжить"/"Continue" button was not found */
  continueEnabled: boolean | null;
  /** true when a Cloudflare challenge frame/page is shown */
  challengeVisible?: boolean;
}

export type SessionState = "ok" | "login_required" | "challenge" | "blocked";

export type CheckResult =
  | { kind: "status"; status: SlotStatus }
  | { kind: "session"; state: Exclude<SessionState, "ok"> }
  | { kind: "config_error"; message: string }
  | { kind: "error"; message: string };

export type BotEvent =
  | { type: "slots_available"; at: string }
  | { type: "slots_gone"; at: string }
  | { type: "session_required"; reason: "login_required" | "challenge" }
  | { type: "session_restored" }
  | { type: "blocked" }
  | { type: "config_error"; message: string }
  | { type: "persistent_failure"; streak: number; reason: string };

export interface MonitorState {
  status?: Exclude<SlotStatus, "UNKNOWN">;
  lastCheckAt?: string;
  lastResult?: string;
  paused: boolean;
  sessionAlerted: boolean;
  unknownStreak: number;
  lastFailureAlertAt?: string;
  lastConfigErrorAlerted?: string;
  blockedStreak: number;
}

export const initialState = (): MonitorState => ({
  paused: false,
  sessionAlerted: false,
  unknownStreak: 0,
  blockedStreak: 0,
});
