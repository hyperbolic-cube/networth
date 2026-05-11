import { getCryptoPrice, getExchangeRate, getStockPrice } from "../api";
import type {
  AssetLiability,
  BrokerMetadata,
  ComputedItem,
  LiabilityMetadata,
  RealEstateMetadata,
  SimpleValueMetadata,
} from "../types";

// ── RowStatus ──────────────────────────────────────────────────────────────

export type RowStatus =
  | "loading"
  | "fresh"
  | "stale"
  | "unavailable_not_found"
  | "unavailable_offline"
  | "override";

// ── computeItem ────────────────────────────────────────────────────────────

/**
 * Resolves the current USD value for a single AssetLiability row by
 * calling the appropriate API helper and applying the correct formula.
 *
 * Liabilities (MORTGAGE, CREDIT_DEBT, AUTO_LOAN) return a negative
 * computed_value_usd so that summing all rows yields net worth directly.
 */
export async function computeItem(
  item: AssetLiability
): Promise<{ computed: ComputedItem; status: RowStatus }> {
  const zero: ComputedItem = {
    ...item,
    computed_value_usd: 0,
    value_in_original_currency: 0,
    exchange_rate_to_usd: 0,
  };

  try {
    switch (item.type) {
      // ── Simple value assets (BANK, CASH, VEHICLE) ──────────────────────
      case "BANK":
      case "CASH":
      case "VEHICLE": {
        const meta = item.metadata as SimpleValueMetadata;
        const amount = meta.amount;
        const fxResult = await getExchangeRate(item.currency);

        if (fxResult.status === "unavailable") {
          return {
            computed: zero,
            status:
              fxResult.reason === "not_found"
                ? "unavailable_not_found"
                : "unavailable_offline",
          };
        }

        const rate = fxResult.value;
        return {
          computed: {
            ...item,
            value_in_original_currency: amount,
            exchange_rate_to_usd: rate,
            computed_value_usd: amount * rate,
          },
          status: fxResult.status,
        };
      }

      // ── Broker accounts (STOCK, BOND, CRYPTO) ──────────────────────────
      case "BROKER": {
        const meta = item.metadata as BrokerMetadata;
        const priceResult =
          meta.instrumentType === "CRYPTO"
            ? await getCryptoPrice(meta.ticker)
            : await getStockPrice(meta.ticker);

        if (priceResult.status === "unavailable") {
          return {
            computed: zero,
            status:
              priceResult.reason === "not_found"
                ? "unavailable_not_found"
                : "unavailable_offline",
          };
        }

        const total = priceResult.value * meta.quantity;
        return {
          computed: {
            ...item,
            value_in_original_currency: total,
            exchange_rate_to_usd: 1,
            computed_value_usd: total,
          },
          status: priceResult.status,
        };
      }

      // ── Real estate ─────────────────────────────────────────────────────
      case "REAL_ESTATE": {
        const meta = item.metadata as RealEstateMetadata;
        const localValue = meta.sqm * meta.price_per_sqm;
        const fxResult = await getExchangeRate(item.currency);

        if (fxResult.status === "unavailable") {
          return {
            computed: zero,
            status:
              fxResult.reason === "not_found"
                ? "unavailable_not_found"
                : "unavailable_offline",
          };
        }

        const rate = fxResult.value;
        return {
          computed: {
            ...item,
            value_in_original_currency: localValue,
            exchange_rate_to_usd: rate,
            computed_value_usd: localValue * rate,
          },
          status: fxResult.status,
        };
      }

      // ── Liabilities (MORTGAGE, CREDIT_DEBT, AUTO_LOAN) ──────────────────
      case "MORTGAGE":
      case "CREDIT_DEBT":
      case "AUTO_LOAN": {
        const meta = item.metadata as LiabilityMetadata;
        const principal = meta.principal;
        const fxResult = await getExchangeRate(item.currency);

        if (fxResult.status === "unavailable") {
          return {
            computed: zero,
            status:
              fxResult.reason === "not_found"
                ? "unavailable_not_found"
                : "unavailable_offline",
          };
        }

        const rate = fxResult.value;
        return {
          computed: {
            ...item,
            value_in_original_currency: principal,
            exchange_rate_to_usd: rate,
            computed_value_usd: -(principal * rate),
          },
          status: fxResult.status,
        };
      }

      default: {
        // Exhaustive guard — TypeScript will catch unhandled cases.
        const _exhaustive: never = item.type;
        console.warn("[computeItem] unhandled type:", _exhaustive);
        return { computed: zero, status: "unavailable_offline" };
      }
    }
  } catch (err) {
    console.error("[computeItem] unexpected error for", item.id, err);
    return { computed: zero, status: "unavailable_offline" };
  }
}
