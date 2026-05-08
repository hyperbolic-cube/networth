// ── Asset / Liability types ────────────────────────────────────────────────

export type AssetType = "BANK" | "BROKER" | "REAL_ESTATE" | "VEHICLE" | "CASH";
export type LiabilityType = "MORTGAGE" | "CREDIT_DEBT" | "AUTO_LOAN";
export type ItemType = AssetType | LiabilityType;

// ── Type-specific metadata shapes ─────────────────────────────────────────

export interface BrokerMetadata {
  instrumentType: "STOCK" | "BOND";
  ticker: string;
  quantity: number;
}

export interface RealEstateMetadata {
  sqm: number;
  price_per_sqm: number;
}

export interface LiabilityMetadata {
  interest_rate: number;    // annual, percent (e.g. 12 for 12%)
  monthly_payment: number;
}

export type AssetMetadata =
  | BrokerMetadata
  | RealEstateMetadata
  | LiabilityMetadata
  | Record<string, never>;

// ── Database row types (mirror the SQLite schema exactly) ──────────────────

/** Table: assets_liabilities */
export interface AssetLiability {
  id: string;               // UUID via expo-crypto
  type: ItemType;
  name: string;
  currency: string;         // e.g. "USD", "KZT"
  metadata: AssetMetadata;  // stored as JSON string in SQLite, parsed on read
  created_at: string;       // ISO timestamp
}

/** Table: snapshots */
export interface Snapshot {
  id: string;
  total_net_worth_usd: number;
  locked_at: string;        // ISO timestamp
}

/** Table: snapshot_items */
export interface SnapshotItem {
  id: string;
  snapshot_id: string;
  asset_liability_id: string;
  value_in_original_currency: number;
  exchange_rate_to_usd: number;
  calculated_value_usd: number;
}

// ── Derived / runtime types ────────────────────────────────────────────────

/** AssetLiability enriched with a live or cached computed value in USD */
export interface ComputedItem extends AssetLiability {
  computed_value_usd: number;
  value_in_original_currency: number;
  exchange_rate_to_usd: number;
}
