import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StateStore } from "../src/state.js";

const tmpFile = () => join(mkdtempSync(join(tmpdir(), "vfs-")), "state.json");

describe("StateStore", () => {
  it("restores the last status after a restart", () => {
    const f = tmpFile();
    new StateStore(f).update({ status: "SLOTS_AVAILABLE", paused: true });
    const again = new StateStore(f).get();
    expect(again.status).toBe("SLOTS_AVAILABLE");
    expect(again.paused).toBe(true);
  });
  it("falls back to initial state on a corrupt file", () => {
    const f = tmpFile();
    writeFileSync(f, "{not json");
    expect(new StateStore(f).get().status).toBeUndefined();
  });
});
