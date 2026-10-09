import { Bot } from "grammy";
import type { Monitor } from "./monitor.js";
import { MIN_INTERVAL_SEC } from "./config.js";
import type { StateStore } from "./state.js";

export interface BotDeps {
  allowedUserIds: number[];
  monitor: Monitor;
  store: StateStore;
  category: string;
  now?: () => Date;
}

export function statusText(store: StateStore, category: string): string {
  const s = store.get();
  const status =
    s.status === "SLOTS_AVAILABLE" ? "слоты ЕСТЬ" : s.status === "NO_SLOTS" ? "слотов нет" : "ещё не определён";
  const session = s.sessionAlerted ? "требуется вход" : "ок";
  return [
    `Категория: ${category}`,
    `Статус: ${status}`,
    `Последняя проверка: ${s.lastCheckAt ?? "ещё не было"}${s.lastResult ? ` (${s.lastResult})` : ""}`,
    `Сессия: ${session}`,
    `Мониторинг: ${s.paused ? "на паузе" : "работает"}`,
  ].join("\n");
}

/** Registers the whitelist guard and commands on a grammY bot. */
export function registerHandlers(bot: Bot, d: BotDeps): void {
  const now = d.now ?? (() => new Date());

  // Whitelist: strangers get no reply at all, so the bot's state is not revealed.
  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (id === undefined || !d.allowedUserIds.includes(id)) return;
    await next();
  });

  bot.command("start", (ctx) =>
    ctx.reply("Бот следит за слотами VFS. Команды: /status /check /pause /resume"),
  );

  bot.command("status", (ctx) => ctx.reply(statusText(d.store, d.category)));

  bot.command("check", async (ctx) => {
    const last = d.store.get().lastCheckAt;
    if (last) {
      const elapsed = (now().getTime() - Date.parse(last)) / 1000;
      if (elapsed < MIN_INTERVAL_SEC) {
        const wait = Math.ceil(MIN_INTERVAL_SEC - elapsed);
        await ctx.reply(`Слишком рано, подождите ещё ${wait} с.`);
        return;
      }
    }
    await ctx.reply("Проверяю…");
    await d.monitor.checkNow();
    await ctx.reply(statusText(d.store, d.category));
  });

  bot.command("pause", async (ctx) => {
    d.monitor.pause();
    await ctx.reply("Мониторинг приостановлен. /resume — продолжить.");
  });

  bot.command("resume", async (ctx) => {
    d.monitor.resume();
    await ctx.reply("Мониторинг возобновлён.");
  });
}

export function createBot(token: string, d: BotDeps): Bot {
  const bot = new Bot(token);
  registerHandlers(bot, d);
  return bot;
}
