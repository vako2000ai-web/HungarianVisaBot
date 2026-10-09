import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { initialState, type MonitorState } from "./types.js";

/** Tiny JSON-file store; atomic write via rename so a crash cannot corrupt state. */
export class StateStore {
  private state: MonitorState;

  constructor(private readonly file: string) {
    this.state = this.load();
  }

  private load(): MonitorState {
    if (!existsSync(this.file)) return initialState();
    try {
      return { ...initialState(), ...JSON.parse(readFileSync(this.file, "utf8")) };
    } catch {
      return initialState();
    }
  }

  get(): MonitorState {
    return this.state;
  }

  update(patch: Partial<MonitorState>): MonitorState {
    this.state = { ...this.state, ...patch };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
    return this.state;
  }
}
