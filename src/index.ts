import "dotenv/config";
import { createBot } from "./bot.js";
import { VfsChecker } from "./browser.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./log.js";
import { Monitor } from "./monitor.js";
import { Notifier, formatEvent } from "./notifier.js";
import { Scheduler } from "./scheduler.js";
import { StateStore } from "./state.js";

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const log = createLogger([cfg.telegramToken]);
  const store = new StateStore(cfg.stateFile);
  const checker = new VfsChecker(cfg);

  // Declared before use below; Monitor/bot reference each other only through closures.
  const monitorRef: { current?: Monitor } = {};
  const bot = createBot(cfg.telegramToken, {
    allowedUserIds: cfg.allowedUserIds,
    store,
    category: `${cfg.category} / ${cfg.subcategory}`,
    get monitor() {
      return monitorRef.current as Monitor;
    },
  });

  const notifier = new Notifier({
    userIds: cfg.allowedUserIds,
    send: (chatId, text) => bot.api.sendMessage(chatId, text),
    onError: (m, e) => log.warn(`${m}: ${e instanceof Error ? e.message : String(e)}`),
  });

  const monitor = new Monitor({
    store,
    check: () => checker.check(),
    emit: async (e) => {
      log.info(`event ${e.type}`);
      await notifier.broadcast(formatEvent(e, `${cfg.category} / ${cfg.subcategory}`));
    },
  });
  monitorRef.current = monitor;

  const scheduler = new Scheduler({
    intervalSec: cfg.intervalSec,
    getBlockedStreak: () => store.get().blockedStreak,
    tick: async () => {
      await notifier.flush();
      const out = await monitor.tick();
      log.info(`tick: ${store.get().lastResult ?? "-"}`);
      return out;
    },
    onError: (e) => log.error("tick failed", e),
  });

  const shutdown = async () => {
    scheduler.stop();
    await bot.stop();
    await checker.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  scheduler.start();
  log.info(`bot started, interval ${cfg.intervalSec}s`);
  await bot.start({ onStart: (me) => log.info(`telegram: @${me.username}`) });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
