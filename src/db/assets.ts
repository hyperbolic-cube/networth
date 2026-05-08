import { randomUUID } from "expo-crypto";
import { db } from "./client";
import type { AssetLiability, AssetMetadata, ItemType } from "../types";

type RawRow = Omit<AssetLiability, "metadata"> & { metadata: string };

function parseRow(row: RawRow): AssetLiability {
  return { ...row, metadata: JSON.parse(row.metadata) as AssetMetadata };
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function createAsset(input: {
  type: ItemType;
  name: string;
  currency: string;
  metadata: AssetMetadata;
}): Promise<AssetLiability> {
  const asset: AssetLiability = {
    id: randomUUID(),
    type: input.type,
    name: input.name,
    currency: input.currency,
    metadata: input.metadata,
    created_at: new Date().toISOString(),
  };

  await db.runAsync(
    `INSERT INTO assets_liabilities (id, type, name, currency, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [asset.id, asset.type, asset.name, asset.currency, JSON.stringify(asset.metadata), asset.created_at]
  );

  return asset;
}

export async function updateAsset(
  id: string,
  updates: Partial<Pick<AssetLiability, "name" | "currency" | "metadata">>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.currency !== undefined) {
    fields.push("currency = ?");
    values.push(updates.currency);
  }
  if (updates.metadata !== undefined) {
    fields.push("metadata = ?");
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE assets_liabilities SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteAsset(id: string): Promise<void> {
  await db.runAsync(`DELETE FROM assets_liabilities WHERE id = ?`, [id]);
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getAllAssets(): Promise<AssetLiability[]> {
  const rows = await db.getAllAsync<RawRow>(
    `SELECT * FROM assets_liabilities ORDER BY created_at ASC`
  );
  return rows.map(parseRow);
}

export async function getAssetById(id: string): Promise<AssetLiability | null> {
  const row = await db.getFirstAsync<RawRow>(
    `SELECT * FROM assets_liabilities WHERE id = ?`,
    [id]
  );
  return row ? parseRow(row) : null;
}
