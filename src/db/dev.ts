import { db } from "./client";
import { initDatabase } from "./schema";
import { createAsset } from "./assets";
import { lockSnapshot } from "./snapshots";

export async function resetDatabase(): Promise<void> {
  await db.execAsync(`DROP TABLE IF EXISTS snapshot_items;`);
  await db.execAsync(`DROP TABLE IF EXISTS snapshots;`);
  await db.execAsync(`DROP TABLE IF EXISTS assets_liabilities;`);
  await db.execAsync(`DROP TABLE IF EXISTS user_settings;`);
  await initDatabase();
}

/** Populates the DB with a single realistic snapshot for UI development. */
export async function seedDatabase(): Promise<void> {
  const bank = await createAsset({
    type: "BANK",
    name: "Chase Checking",
    currency: "USD",
    metadata: { amount: 12000 } as { amount: number },
  });

  const broker = await createAsset({
    type: "BROKER",
    name: "Tesla Shares",
    currency: "USD",
    metadata: { instrumentType: "STOCK", ticker: "TSLA", quantity: 10 },
  });

  const realEstate = await createAsset({
    type: "REAL_ESTATE",
    name: "Main Apartment",
    currency: "USD",
    metadata: { sqm: 80, price_per_sqm: 3500 },
  });

  const mortgage = await createAsset({
    type: "MORTGAGE",
    name: "Home Loan",
    currency: "USD",
    metadata: { principal: 245000, interest_rate: 6.5, monthly_payment: 2200 },
  });

  // Liabilities use negative calculated_value_usd so they subtract from net worth.
  await lockSnapshot({
    lockedAt: new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)).toISOString(),
    isAutoFilled: 0,
    items: [
      { asset_liability_id: bank.id,       value_in_original_currency:  12000,    exchange_rate_to_usd: 1, calculated_value_usd:  12000 },
      { asset_liability_id: broker.id,     value_in_original_currency:  2500,     exchange_rate_to_usd: 1, calculated_value_usd:  2500 },
      { asset_liability_id: realEstate.id, value_in_original_currency:  280000,   exchange_rate_to_usd: 1, calculated_value_usd:  280000 },
      { asset_liability_id: mortgage.id,   value_in_original_currency: -245000,   exchange_rate_to_usd: 1, calculated_value_usd: -245000 },
    ],
  });
}
