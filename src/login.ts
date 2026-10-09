import "dotenv/config";
import { launchContext } from "./browser.js";
import { loadConfig } from "./config.js";

/**
 * Opens a visible browser on the VFS login page. The owner logs in by hand
 * (including the Cloudflare check); the session is stored in PROFILE_DIR.
 * No credentials are read, stored or typed by this program.
 */
async function main(): Promise<void> {
  const cfg = loadConfig({ ...process.env, TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "-", ALLOWED_USER_IDS: process.env.ALLOWED_USER_IDS ?? "0" });
  const context = await launchContext(cfg, { headed: true });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${cfg.baseUrl}/login`);
  console.log("Войдите в аккаунт VFS в открывшемся окне. Окно закроется само после входа (до 10 минут).");

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline && !page.isClosed()) {
    if (!/\/login/i.test(new URL(page.url()).pathname)) {
      console.log("Вход выполнен, сессия сохранена в", cfg.profileDir);
      await context.close();
      return;
    }
    await page.waitForTimeout(1000).catch(() => undefined);
  }
  console.error("Вход не выполнен за отведённое время.");
  await context.close().catch(() => undefined);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
