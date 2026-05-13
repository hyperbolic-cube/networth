import { getNow } from "./clock";

export function isInLockWindow(date: Date = getNow()): boolean {
  return date.getDate() <= 5;
}

export function getCurrentMonthSnapshotDate(date: Date = getNow()): string {
  // Use local year/month but anchor to UTC midnight — matches the canonical
  // locked_at format ("2026-06-01T00:00:00.000Z") in the snapshots table.
  const firstOfMonth = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    1,
  ));
  return firstOfMonth.toISOString();
}

export function getCurrentYearMonth(date: Date = getNow()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function nextLockWindowDate(date: Date = getNow()): string {
  // Local constructor — correct for a display date (not a stored timestamp).
  const first = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
