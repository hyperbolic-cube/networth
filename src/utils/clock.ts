import { deleteSetting, getSetting, setSetting } from "../db/settings";

let _mockDate: Date | null = null;

export function getNow(): Date {
  if (__DEV__ && _mockDate !== null) return _mockDate;
  return new Date();
}

export function getNowMs(): number {
  return getNow().getTime();
}

export function setMockDate(date: Date | null): void {
  if (!__DEV__) return;
  _mockDate = date;
  // Fire-and-forget persistence so the mock survives app reload.
  // Failure is non-critical (dev tooling only).
  if (date !== null) {
    setSetting("mock_date", date.toISOString()).catch((err) => {
      console.warn("[clock] failed to persist mock date:", err);
    });
  } else {
    deleteSetting("mock_date").catch((err) => {
      console.warn("[clock] failed to clear mock date:", err);
    });
  }
}

export function getMockDate(): Date | null {
  if (!__DEV__) return null;
  return _mockDate;
}

export function advanceMockDate(deltaMs: number): void {
  setMockDate(new Date(getNow().getTime() + deltaMs));
}

/**
 * Reads a persisted mock date from user_settings and, if found, sets both
 * the module-level _mockDate and the Zustand clockStore so all consumers
 * (getNow(), banner, lock-window checks) see the same value immediately.
 *
 * Must be called after initDatabase() (user_settings table must exist) and
 * before any code that calls getNow() — i.e. before getLatestSnapshot /
 * getMissedMonths in App.tsx init.
 *
 * No-op in production (__DEV__ guard).
 */
export async function initClock(): Promise<void> {
  if (!__DEV__) return;

  const raw = await getSetting("mock_date");
  if (raw === null) return;

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return; // corrupt row — ignore

  _mockDate = parsed; // set directly (not via setMockDate) to avoid re-persisting

  // Lazy require avoids a circular module dependency: clockStore already
  // imports clock (for setMockDate, getMockDate, etc.), so a top-level import
  // here would create a cycle whose init-time behaviour depends on bundle
  // evaluation order. Requiring inside the function body is safe because
  // initClock() is only ever called after all modules have loaded.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useClockStore } = require("../store/clockStore") as typeof import("../store/clockStore");
  useClockStore.setState({ mockDate: parsed });
}
