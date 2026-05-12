import { db } from "./client";

export async function initDatabase(): Promise<void> {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);
  await db.execAsync(`PRAGMA foreign_keys = ON;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assets_liabilities (
      id          TEXT    PRIMARY KEY NOT NULL,
      type        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      currency    TEXT    NOT NULL DEFAULT 'USD',
      metadata    TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id                  TEXT    PRIMARY KEY NOT NULL,
      total_net_worth_usd REAL    NOT NULL,
      locked_at           TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshot_items (
      id                          TEXT    PRIMARY KEY NOT NULL,
      snapshot_id                 TEXT    NOT NULL,
      asset_liability_id          TEXT    NOT NULL,
      value_in_original_currency  REAL    NOT NULL,
      exchange_rate_to_usd        REAL    NOT NULL,
      calculated_value_usd        REAL    NOT NULL,
      FOREIGN KEY (snapshot_id)          REFERENCES snapshots(id),
      FOREIGN KEY (asset_liability_id)   REFERENCES assets_liabilities(id)
    );

    CREATE TABLE IF NOT EXISTS api_cache (
      key         TEXT    PRIMARY KEY NOT NULL,
      value       TEXT    NOT NULL,
      fetched_at  INTEGER NOT NULL
    );
  `);

  // ── Tables added after Phase 2 ─────────────────────────────────────────────

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Seed default settings; INSERT OR IGNORE preserves existing values on re-init.
  await db.execAsync(
    `INSERT OR IGNORE INTO user_settings (key, value) VALUES ('edits_remaining', '3');`
  );

  // ── Migrations (idempotent — run on every app launch) ─────────────────────
  // ADD COLUMN: catch "duplicate column" and swallow; rethrow anything else.

  await db.execAsync(
    `ALTER TABLE snapshots ADD COLUMN is_auto_filled INTEGER DEFAULT 0;`
  ).catch((e: unknown) => {
    if (!String(e instanceof Error ? e.message : e).includes("duplicate column")) throw e;
  });

  // ── Dev schema verification ────────────────────────────────────────────────

  if (__DEV__) {
    const snapshotsSchema = await db.getFirstAsync<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='snapshots'`
    );
    console.log("[schema] snapshots:", snapshotsSchema?.sql);

    const settingsRows = await db.getAllAsync(`SELECT * FROM user_settings`);
    console.log("[schema] user_settings:", settingsRows);
  }
}
