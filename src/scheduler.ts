export const MAX_BACKOFF_FACTOR = 8;
export const JITTER = 0.2;

/** Delay before the next check: interval ± jitter, doubled per consecutive block, capped. */
export function nextDelayMs(intervalSec: number, blockedStreak: number, random: () => number = Math.random): number {
  const factor = Math.min(2 ** blockedStreak, MAX_BACKOFF_FACTOR);
  const jitter = 1 + (random() * 2 - 1) * JITTER;
  return Math.round(intervalSec * 1000 * factor * jitter);
}

export interface SchedulerDeps {
  intervalSec: number;
  tick: () => Promise<{ blocked: boolean }>;
  getBlockedStreak: () => number;
  random?: () => number;
  onError?: (e: unknown) => void;
}

export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly d: SchedulerDeps) {}

  start(immediate = true): void {
    this.stopped = false;
    this.schedule(immediate ? 0 : nextDelayMs(this.d.intervalSec, 0, this.d.random));
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.d.tick();
      } catch (e) {
        this.d.onError?.(e);
      }
      this.schedule(nextDelayMs(this.d.intervalSec, this.d.getBlockedStreak(), this.d.random));
    }, ms);
  }
}
