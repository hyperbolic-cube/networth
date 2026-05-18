import type { AssetLiability, BrokerMetadata } from "../types";
import { computeItem } from "./computeItems";

// ── Asset class taxonomy ───────────────────────────────────────────────────
//
// 6 classes mirror the user's Google Sheets columns and the breakdown table
// (Phase 7b.3). Source of truth — do not duplicate the switch elsewhere.

export type AssetClass =
  | "Stocks"
  | "Crypto"
  | "Cash"
  | "RealEstate"
  | "Vehicles"
  | "Debt";

export const ASSET_CLASSES: readonly AssetClass[] = [
  "Stocks",
  "Crypto",
  "Cash",
  "RealEstate",
  "Vehicles",
  "Debt",
] as const;

export function classifyAsset(a: AssetLiability): AssetClass {
  switch (a.type) {
    case "BANK":
    case "CASH":
      return "Cash";
    case "REAL_ESTATE":
      return "RealEstate";
    case "VEHICLE":
      return "Vehicles";
    case "MORTGAGE":
    case "CREDIT_DEBT":
    case "AUTO_LOAN":
      return "Debt";
    case "BROKER": {
      const m = a.metadata as BrokerMetadata;
      return m.instrumentType === "CRYPTO" ? "Crypto" : "Stocks";
    }
    default: {
      const _exhaustive: never = a.type;
      throw new Error(`unreachable asset type: ${String(_exhaustive)}`);
    }
  }
}

export type ClassTotals = Record<AssetClass, number>;

/**
 * Sums live USD values per asset class. Debt totals are negative (computeItem
 * returns negative for liabilities). Items that fail to resolve contribute 0,
 * matching the forgiveness model used by TodayScreen's footer.
 */
export async function aggregateByClass(
  assets: AssetLiability[]
): Promise<ClassTotals> {
  const totals: ClassTotals = {
    Stocks: 0,
    Crypto: 0,
    Cash: 0,
    RealEstate: 0,
    Vehicles: 0,
    Debt: 0,
  };
  const results = await Promise.all(assets.map((a) => computeItem(a)));
  results.forEach((r, i) => {
    totals[classifyAsset(assets[i])] += r.computed.computed_value_usd;
  });
  return totals;
}
