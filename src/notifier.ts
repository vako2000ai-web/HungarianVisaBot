import type { BotEvent } from "./types.js";

export const BOOKING_URL = "https://services.vfsglobal.by/blr/ru/hun/application-detail";

export function formatEvent(e: BotEvent, category: string): string {
  switch (e.type) {
    case "slots_available":
      return `✅ Появились слоты!\n${category}\nОбнаружено: ${e.at}\nЗаписаться: ${BOOKING_URL}`;
    case "slots_gone":
      return `⛔ Слоты закончились.\n${category}\nВремя: ${e.at}`;
    case "session_required":
      return e.reason === "challenge"
        ? "⚠️ Cloudflare просит проверку. Откройте браузер бота (npm run login) и пройдите её вручную. Проверки приостановлены."
        : "⚠️ Сессия VFS истекла — нужен повторный вход (npm run login). Проверки приостановлены до входа.";
    case "session_restored":
      return "✅ Вход восстановлен, проверки возобновлены.";
    case "blocked":
      return "⚠️ Портал ограничил частоту запросов. Интервал проверок увеличен автоматически.";
    case "config_error":
      return `❌ Ошибка конфигурации: ${e.message}`;
    case "persistent_failure":
      return `❌ ${e.streak} проверок подряд без результата (${e.reason}). Возможно, изменилась страница портала.`;
  }
}

export type SendFn = (chatId: number, text: string) => Promise<unknown>;

export interface NotifierOpts {
  userIds: number[];
  send: SendFn;
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onError?: (msg: string, err: unknown) => void;
}

interface Pending {
  chatId: number;
  text: string;
}

/**
 * Sends to every allowed user. A delivery that still fails after retries stays in an
 * outbox and is retried on the next send()/flush(), so an event is not lost on a Telegram outage.
 */
export class Notifier {
  private outbox: Pending[] = [];
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: NotifierOpts) {
    this.attempts = o.attempts ?? 4;
    this.baseDelayMs = o.baseDelayMs ?? 1000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get pending(): number {
    return this.outbox.length;
  }

  async broadcast(text: string): Promise<void> {
    await this.flush();
    await Promise.all(this.o.userIds.map((chatId) => this.deliver({ chatId, text })));
  }

  async flush(): Promise<void> {
    const items = this.outbox;
    this.outbox = [];
    for (const p of items) await this.deliver(p);
  }

  private async deliver(p: Pending): Promise<void> {
    for (let i = 0; i < this.attempts; i++) {
      try {
        await this.o.send(p.chatId, p.text);
        return;
      } catch (err) {
        this.o.onError?.(`send to ${p.chatId} failed (attempt ${i + 1}/${this.attempts})`, err);
        if (i < this.attempts - 1) await this.sleep(this.baseDelayMs * 2 ** i);
      }
    }
    this.outbox.push(p);
  }
}
