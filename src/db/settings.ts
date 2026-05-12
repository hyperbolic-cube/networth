import { db } from "./client";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM user_settings WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)`,
    [key, value]
  );
}

export async function getEditsRemaining(): Promise<number> {
  const raw = await getSetting("edits_remaining");
  if (raw === null) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// Atomically decrements edits_remaining if > 0. Returns the new value.
// The WHERE guard prevents going below 0; if already 0 the UPDATE is a no-op.
export async function decrementEdits(): Promise<number> {
  await db.runAsync(
    `UPDATE user_settings
     SET value = CAST(value AS INTEGER) - 1
     WHERE key = 'edits_remaining'
       AND CAST(value AS INTEGER) > 0`
  );
  return getEditsRemaining();
}
