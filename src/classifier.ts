import type { PageSnapshot, SlotStatus } from "./types.js";

/** Texts the portal shows when there is nothing to book (ru/en). Keep in one place. */
export const NO_SLOTS_PATTERNS: RegExp[] = [
  /нет доступных слотов/i,
  /в настоящий момент нет доступных/i,
  /no appointment slots? (are )?(currently )?available/i,
  /currently no appointment slots/i,
  /no slots? available/i,
];

/**
 * Classify the application-detail page after category selection.
 * Anything not clearly one of the two known states is UNKNOWN, never a guess.
 */
export function classifySlots(s: PageSnapshot): SlotStatus {
  if (NO_SLOTS_PATTERNS.some((re) => re.test(s.text))) return "NO_SLOTS";
  if (s.continueEnabled === true) return "SLOTS_AVAILABLE";
  return "UNKNOWN";
}
