import { describe, expect, it } from "vitest";
import { createLogger, redact } from "../src/log.js";

describe("redact", () => {
  it("masks configured secrets, bot tokens, passwords and cookies", () => {
    const token = "123456789:AAH-abcdefghijklmnopqrstuvwxyz012";
    const out = redact(`login failed password=hunter2 cookie: sid=abc url bot${token}/send`, ["hunter2"]);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sid=abc");
    expect(out).not.toContain(token);
  });
  it("logger never emits secrets, including inside error messages", () => {
    const lines: string[] = [];
    const log = createLogger(["s3cret"], (l) => lines.push(l));
    log.error("login", new Error("bad password=s3cret token=xyz"));
    expect(lines.join("\n")).not.toMatch(/s3cret|xyz/);
  });
});
