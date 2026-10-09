import { chromium, type BrowserContext, type Page } from "playwright";
import { classifySlots } from "./classifier.js";
import type { Config } from "./config.js";
import { detectSessionState } from "./session.js";
import type { CheckResult, PageSnapshot } from "./types.js";

export async function launchContext(cfg: Config, opts: { headed?: boolean } = {}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(cfg.profileDir, {
    headless: !(opts.headed ?? cfg.headed),
    executablePath: cfg.chromiumPath,
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  });
}

export class OptionNotFoundError extends Error {
  constructor(label: string, wanted: string, available: string[]) {
    super(`${label} "${wanted}" не найден(а) в списке. Доступно: ${available.join(" | ") || "—"}`);
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function snapshot(page: Page, httpStatus?: number): Promise<PageSnapshot> {
  const data = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role=button]"));
    const btn = buttons.find((b) => /продолжить|continue/i.test(b.innerText ?? ""));
    const disabled = (el: HTMLElement) =>
      (el as HTMLButtonElement).disabled === true ||
      el.getAttribute("aria-disabled") === "true" ||
      /disabled/.test(el.className);
    return {
      text: document.body?.innerText ?? "",
      title: document.title,
      continueEnabled: btn ? !disabled(btn) : null,
    };
  });
  return {
    url: page.url(),
    httpStatus,
    text: data.text,
    continueEnabled: data.continueEnabled,
    challengeVisible: /just a moment/i.test(data.title),
  };
}

/** Pick `optionText` in the nth Angular Material select, skipping the click if it is already chosen. */
async function selectOption(page: Page, index: number, label: string, optionText: string): Promise<void> {
  const select = page.locator("mat-select").nth(index);
  await select.waitFor({ state: "visible", timeout: 15_000 });
  const current = (await select.innerText()).trim();
  if (current.toLowerCase() === optionText.toLowerCase()) return;
  await select.click();
  const option = page.locator("mat-option").filter({ hasText: new RegExp(`^\\s*${escapeRe(optionText)}\\s*$`, "i") });
  try {
    await option.first().waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    const available = (await page.locator("mat-option").allInnerTexts()).map((t) => t.trim());
    await page.keyboard.press("Escape");
    throw new OptionNotFoundError(label, optionText, available);
  }
  await option.first().click();
}

async function waitForVerdict(page: Page, httpStatus: number | undefined, timeoutMs: number): Promise<PageSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let snap = await snapshot(page, httpStatus);
  while (classifySlots(snap) === "UNKNOWN" && Date.now() < deadline) {
    await page.waitForTimeout(500);
    snap = await snapshot(page, httpStatus);
  }
  return snap;
}

/** One serialized check against the portal. Never submits anything: it only reads the page. */
export class VfsChecker {
  private context: BrowserContext | undefined;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly cfg: Config) {}

  check(): Promise<CheckResult> {
    const run = this.chain.then(() => this.checkOnce());
    this.chain = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
  }

  private async checkOnce(): Promise<CheckResult> {
    try {
      this.context ??= await launchContext(this.cfg);
      const page = this.context.pages()[0] ?? (await this.context.newPage());
      const response = await page.goto(`${this.cfg.baseUrl}/application-detail`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      const status = response?.status();

      const before = detectSessionState(await snapshot(page, status));
      if (before !== "ok") return { kind: "session", state: before };

      try {
        await selectOption(page, 0, "Центр", this.cfg.center);
        await selectOption(page, 1, "Категория", this.cfg.category);
        await selectOption(page, 2, "Подкатегория", this.cfg.subcategory);
      } catch (e) {
        if (e instanceof OptionNotFoundError) return { kind: "config_error", message: e.message };
        throw e;
      }

      const snap = await waitForVerdict(page, status, 10_000);
      const after = detectSessionState(snap);
      if (after !== "ok") return { kind: "session", state: after };
      return { kind: "status", status: classifySlots(snap) };
    } catch (e) {
      // a crashed/closed browser must not wedge the bot: drop it and relaunch next time
      await this.close();
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }
}
