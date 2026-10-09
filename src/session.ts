import type { PageSnapshot, SessionState } from "./types.js";

const CHALLENGE_RE =
  /just a moment|verify you are human|checking your browser|проверка безопасности|подтвердите,? что вы человек/i;
const BLOCKED_RE = /too many requests|access denied|error 1015|rate limited|you have been blocked|слишком много запросов/i;

/**
 * Decide whether the snapshot is a usable portal page.
 * Order matters: a login redirect wins over a challenge widget, because the login
 * page itself embeds a Turnstile widget.
 */
export function detectSessionState(s: PageSnapshot): SessionState {
  if (s.httpStatus === 429 || BLOCKED_RE.test(s.text)) return "blocked";
  if (/\/login(\/|\?|$)/i.test(new URL(s.url).pathname)) return "login_required";
  if (s.httpStatus === 403 || s.challengeVisible || CHALLENGE_RE.test(s.text)) return "challenge";
  return "ok";
}

export interface SessionAlertStep {
  alerted: boolean;
  event: "alert" | "restored" | null;
}

/** One alert when the session breaks, one confirmation when it recovers, nothing in between. */
export function nextSessionAlert(alerted: boolean, state: SessionState): SessionAlertStep {
  const bad = state === "login_required" || state === "challenge";
  if (bad && !alerted) return { alerted: true, event: "alert" };
  if (state === "ok" && alerted) return { alerted: false, event: "restored" };
  return { alerted, event: null };
}
