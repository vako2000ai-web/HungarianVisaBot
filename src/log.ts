/** Logger that never prints configured secrets, passwords or cookies. */
const SENSITIVE_KV = /\b(password|passwd|pwd|pass|cookie|set-cookie|authorization|token)\b(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;

export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s) out = out.split(s).join("***");
  }
  // Telegram bot tokens look like 123456789:AA... even when not configured explicitly
  out = out.replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, "***");
  return out.replace(SENSITIVE_KV, (_m, k: string, sep: string) => `${k}${sep}***`);
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export function createLogger(secrets: string[], sink: (line: string) => void = console.log): Logger {
  const fmt = (level: string, msg: string) =>
    sink(`${new Date().toISOString()} ${level} ${redact(msg, secrets)}`);
  const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  return {
    info: (m) => fmt("INFO", m),
    warn: (m) => fmt("WARN", m),
    error: (m, e) => fmt("ERROR", e === undefined ? m : `${m}: ${errText(e)}`),
  };
}
