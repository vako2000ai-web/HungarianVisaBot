import { z } from "zod";

export const MIN_INTERVAL_SEC = 60;

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string({ error: "is required" }).min(1, "is required"),
  ALLOWED_USER_IDS: z
    .string({ error: "is required" })
    .min(1, "is required")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^\d+$/, "user id must be numeric")).min(1)),
  VFS_BASE_URL: z.string().url().default("https://services.vfsglobal.by/blr/ru/hun"),
  VFS_CENTER: z.string().min(1).default("Hungary Visa Application Center, Minsk"),
  VFS_CATEGORY: z.string().min(1).default("short term visa C"),
  VFS_SUBCATEGORY: z.string().min(1).default("Short-Term VISA 90 days"),
  CHECK_INTERVAL_SEC: z.coerce
    .number()
    .int()
    .min(MIN_INTERVAL_SEC, `CHECK_INTERVAL_SEC must be >= ${MIN_INTERVAL_SEC}`)
    .default(180),
  PROFILE_DIR: z.string().min(1).default("./profile"),
  STATE_FILE: z.string().min(1).default("./state.json"),
  CHROMIUM_PATH: z.string().optional(),
  HEADED: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
});

export interface Config {
  telegramToken: string;
  allowedUserIds: number[];
  baseUrl: string;
  center: string;
  category: string;
  subcategory: string;
  intervalSec: number;
  profileDir: string;
  stateFile: string;
  headed: boolean;
  chromiumPath?: string;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "config"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }
  const c = parsed.data;
  return {
    telegramToken: c.TELEGRAM_BOT_TOKEN,
    allowedUserIds: c.ALLOWED_USER_IDS.map(Number),
    baseUrl: c.VFS_BASE_URL.replace(/\/+$/, ""),
    center: c.VFS_CENTER,
    category: c.VFS_CATEGORY,
    subcategory: c.VFS_SUBCATEGORY,
    intervalSec: c.CHECK_INTERVAL_SEC,
    profileDir: c.PROFILE_DIR,
    stateFile: c.STATE_FILE,
    headed: c.HEADED,
    chromiumPath: c.CHROMIUM_PATH || undefined,
  };
}
