import { readFileSync } from "node:fs";
import type { PageSnapshot } from "../src/types.js";

export function fixture(name: string): PageSnapshot {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}
