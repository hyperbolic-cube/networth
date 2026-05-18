// ── Shared formatting helpers ──────────────────────────────────────────────
//
// Only put helpers here when they are needed by 2+ screens. Formatters that
// are used by a single screen live inline in that screen.

/** Whole-dollar format with thousand separators. Negative renders as `−$1,234`. */
export function formatHeroMoney(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n < 0 ? "−" + formatted : formatted;
}

/**
 * Long date label like "May 1, 2026". Parses string components directly to
 * avoid the UTC→local rollback that bites negative-UTC-offset timezones.
 */
export function monthDayYearLabel(lockedAt: string): string {
  const [year, month, day] = lockedAt.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Full month + year label like "June 2026". Used as the snapshot detail
 * screen title.
 */
export function monthYearLabel(lockedAt: string): string {
  const [year, month] = lockedAt.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}
