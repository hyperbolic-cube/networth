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
  `);
}
