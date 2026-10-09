import { describe, expect, it } from "vitest";
import { classifySlots } from "../src/classifier.js";
import { fixture } from "./helpers.js";

describe("classifySlots", () => {
  it("NO_SLOTS when the portal says there are no slots", () => {
    expect(classifySlots(fixture("no_slots"))).toBe("NO_SLOTS");
  });
  it("SLOTS_AVAILABLE when no message and Continue is enabled", () => {
    expect(classifySlots(fixture("slots_available"))).toBe("SLOTS_AVAILABLE");
  });
  it("UNKNOWN for a half-loaded / unexpected page", () => {
    expect(classifySlots(fixture("broken_page"))).toBe("UNKNOWN");
  });
  it("never reports slots when the no-slots message is present, even with an enabled button", () => {
    expect(classifySlots({ ...fixture("no_slots"), continueEnabled: true })).toBe("NO_SLOTS");
  });
});
