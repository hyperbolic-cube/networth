import { randomUUID } from "expo-crypto";
import { db } from "./client";
import type { Snapshot, SnapshotItem } from "../types";

type LockItemInput = {
  asset_liability_id: string;
  value_in_original_currency: number;
  exchange_rate_to_usd: number;
  calculated_value_usd: number;
};

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Atomically writes a snapshot + all its items.
 * lockedAt must be the canonical first-of-month ISO timestamp (e.g.
 * "2026-06-01T00:00:00.000Z"). isAutoFilled is 0 for user-initiated locks,
 * 1 for auto-filled missed months.
 * Liabilities must carry a negative calculated_value_usd so the sum equals net worth.
 */
export async function lockSnapshot(params: {
  items: LockItemInput[];
  lockedAt: string;
  isAutoFilled: 0 | 1;
}): Promise<Snapshot> {
  const { items, lockedAt, isAutoFilled } = params;
  const totalNetWorth = items.reduce((sum, item) => sum + item.calculated_value_usd, 0);

  const snapshot: Snapshot = {
    id: randomUUID(),
    total_net_worth_usd: totalNetWorth,
    locked_at: lockedAt,
    is_auto_filled: isAutoFilled,
  };

  const rows: SnapshotItem[] = items.map((item) => ({
    id: randomUUID(),
    snapshot_id: snapshot.id,
    ...item,
  }));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO snapshots (id, total_net_worth_usd, locked_at, is_auto_filled)
       VALUES (?, ?, ?, ?)`,
      [snapshot.id, snapshot.total_net_worth_usd, snapshot.locked_at, snapshot.is_auto_filled],
    );

    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO snapshot_items
           (id, snapshot_id, asset_liability_id,
            value_in_original_currency, exchange_rate_to_usd, calculated_value_usd)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.snapshot_id,
          row.asset_liability_id,
          row.value_in_original_currency,
          row.exchange_rate_to_usd,
          row.calculated_value_usd,
        ],
      );
    }
  });

  return snapshot;
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getAllSnapshots(): Promise<Snapshot[]> {
  return db.getAllAsync<Snapshot>(
    `SELECT * FROM snapshots ORDER BY locked_at ASC`,
  );
}

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  return db.getFirstAsync<Snapshot>(
    `SELECT * FROM snapshots ORDER BY locked_at DESC LIMIT 1`,
  );
}

/**
 * Returns the snapshot whose locked_at falls in the given month, or null if
 * none exists. yearMonth format: "YYYY-MM" (e.g. "2026-06").
 */
export async function getSnapshotByMonth(yearMonth: string): Promise<Snapshot | null> {
  return db.getFirstAsync<Snapshot>(
    `SELECT * FROM snapshots WHERE strftime('%Y-%m', locked_at) = ? LIMIT 1`,
    [yearMonth],
  );
}

export async function getSnapshotItems(snapshotId: string): Promise<SnapshotItem[]> {
  return db.getAllAsync<SnapshotItem>(
    `SELECT * FROM snapshot_items WHERE snapshot_id = ?`,
    [snapshotId],
  );
}

export async function getSnapshotCount(): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM snapshots`,
  );
  return row?.count ?? 0;
}

export async function getLatestAutoFilledSnapshot(): Promise<Snapshot | null> {
  return db.getFirstAsync<Snapshot>(
    `SELECT * FROM snapshots WHERE is_auto_filled = 1 ORDER BY locked_at DESC LIMIT 1`,
  );
}

/**
 * Returns the most recent snapshot whose locked_at is strictly before the
 * given ISO timestamp. Used by auto-fill to find the "previous" snapshot for
 * a given missed month so amortization and frozen values can be seeded.
 */
export async function getSnapshotBefore(lockedAt: string): Promise<Snapshot | null> {
  return db.getFirstAsync<Snapshot>(
    `SELECT * FROM snapshots WHERE locked_at < ? ORDER BY locked_at DESC LIMIT 1`,
    [lockedAt],
  );
}

export async function getSnapshotById(id: string): Promise<Snapshot | null> {
  return db.getFirstAsync<Snapshot>(
    `SELECT * FROM snapshots WHERE id = ? LIMIT 1`,
    [id],
  );
}
