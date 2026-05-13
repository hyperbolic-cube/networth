import { getNow } from "./clock";
import { applyAmortization } from "./amortization";
import { getSnapshotBefore, getSnapshotItems, lockSnapshot } from "../db/snapshots";
import { getAllAssets, updateAsset } from "../db/assets";
import { getExchangeRate, getStockPrice, getCryptoPrice } from "../api";
import type {
  AssetLiability,
  BrokerMetadata,
  LiabilityMetadata,
  RealEstateMetadata,
  SimpleValueMetadata,
  SnapshotItem,
} from "../types";

// ── Constants ──────────────────────────────────────────────────────────────

const LIABILITY_TYPES = new Set<string>(["MORTGAGE", "CREDIT_DEBT", "AUTO_LOAN"]);

// ── Types ──────────────────────────────────────────────────────────────────

type LockItemInput = {
  asset_liability_id: string;
  value_in_original_currency: number;
  exchange_rate_to_usd: number;
  calculated_value_usd: number;
};

// ── getMissedMonths ────────────────────────────────────────────────────────

/**
 * Returns an array of canonical first-of-month ISO timestamps ("YYYY-MM-01T...")
 * for every month that has elapsed since lastSnapshotDate with no snapshot, in
 * chronological order.
 *
 * Rules:
 *  - null lastSnapshotDate → [] always (first-time user; existing hint handles UX)
 *  - in lock window (day 1–5): current month is excluded (Lock button is shown)
 *  - outside lock window (day 6+): current month IS included (lock window already closed)
 */
export function getMissedMonths(
  lastSnapshotDate: string | null,
  today: Date = getNow(),
): string[] {
  if (lastSnapshotDate === null) return [];

  const inLockWindow = today.getDate() <= 5;
  const currentMonthFirstMs = Date.UTC(today.getFullYear(), today.getMonth(), 1);

  // First candidate = the month immediately after the last snapshot.
  const lastUTC = new Date(lastSnapshotDate);
  let cursor = Date.UTC(lastUTC.getUTCFullYear(), lastUTC.getUTCMonth() + 1, 1);

  // endMs is inclusive: in lock window we stop before the current month;
  // outside we include the current month (its lock window has already closed).
  const endMs = inLockWindow ? currentMonthFirstMs - 1 : currentMonthFirstMs;

  if (cursor > endMs) return [];

  const months: string[] = [];
  while (cursor <= endMs) {
    const d = new Date(cursor);
    months.push(d.toISOString());
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return months;
}

// ── buildLockItem ──────────────────────────────────────────────────────────

/**
 * Resolves a single LockItemInput for auto-fill.
 *
 * Returns null to SKIP the asset (not write zeros). Callers filter out nulls
 * before passing to lockSnapshot. This happens only for BROKER assets that
 * are permanently not_found and have no prior snapshot to fall back to.
 *
 * Throws to STOP this month's auto-fill on transient failures (offline FX /
 * offline broker with no fallback). Caller catches the throw and lets
 * App.tsx retry on the next launch.
 */
async function buildLockItem(
  asset: AssetLiability,
  prevItem: SnapshotItem | undefined,
): Promise<LockItemInput | null> {
  const { id, type, currency } = asset;

  // ── Liabilities (MORTGAGE, CREDIT_DEBT, AUTO_LOAN) ────────────────────
  if (LIABILITY_TYPES.has(type)) {
    const meta = asset.metadata as LiabilityMetadata;
    // prevItem.value_in_original_currency is the principal AT THE START of
    // the previous month (pre-amortization for that month). Applying one
    // cycle gives us the principal at the start of THIS month.
    const prevPrincipal = prevItem?.value_in_original_currency ?? meta.principal;
    const principal = applyAmortization(prevPrincipal, meta.interest_rate, meta.monthly_payment);

    const fxResult = await getExchangeRate(currency);
    let rate: number;
    if (fxResult.status !== "unavailable") {
      rate = fxResult.value;
    } else if (prevItem) {
      // Graceful stale fallback: use previous snapshot's rate rather than
      // stopping the whole month for an offline FX fetch.
      rate = prevItem.exchange_rate_to_usd;
    } else {
      throw new Error(`[autofill] FX unavailable for liability ${id}`);
    }

    return {
      asset_liability_id: id,
      value_in_original_currency: principal,
      exchange_rate_to_usd: rate,
      calculated_value_usd: -(principal * rate),
    };
  }

  // ── Broker (STOCK, BOND, CRYPTO) ──────────────────────────────────────
  if (type === "BROKER") {
    const meta = asset.metadata as BrokerMetadata;
    const priceResult =
      meta.instrumentType === "CRYPTO"
        ? await getCryptoPrice(meta.ticker)
        : await getStockPrice(meta.ticker);

    if (priceResult.status !== "unavailable") {
      const total = priceResult.value * meta.quantity;
      return {
        asset_liability_id: id,
        value_in_original_currency: total,
        exchange_rate_to_usd: 1,
        calculated_value_usd: total,
      };
    }

    // Price unavailable — fall back to prevItem values if available,
    // regardless of the specific reason (offline or not_found).
    if (prevItem) {
      if (__DEV__) {
        console.warn(`[autofill] price unavailable for ${id} (${priceResult.reason}), using prevItem`);
      }
      return {
        asset_liability_id: id,
        value_in_original_currency: prevItem.value_in_original_currency,
        exchange_rate_to_usd: prevItem.exchange_rate_to_usd,
        calculated_value_usd: prevItem.calculated_value_usd,
      };
    }

    // No prevItem to fall back to.
    if (priceResult.reason === "not_found") {
      // Permanent failure (bad/delisted ticker). Skip rather than write zeros.
      if (__DEV__) {
        console.warn(`[autofill] broker not_found, no prevItem for ${id} — skipping asset`);
      }
      return null;
    }

    // Transient offline failure with no fallback — stop this month.
    throw new Error(`[autofill] broker offline, no prevItem for ${id}`);
  }

  // ── Static-value assets (BANK, CASH, VEHICLE, REAL_ESTATE) ───────────
  // Always fetch current FX (per DECISIONS.md: current rates, not historical).
  // Fall back to prevItem's rate only if offline and prevItem exists.
  const fxResult = await getExchangeRate(currency);
  let rate: number;
  if (fxResult.status !== "unavailable") {
    rate = fxResult.value;
  } else if (prevItem) {
    rate = prevItem.exchange_rate_to_usd;
  } else {
    throw new Error(`[autofill] FX unavailable for asset ${id}`);
  }

  if (prevItem) {
    // Freeze the amount from the previous snapshot; convert at current FX.
    const value = prevItem.value_in_original_currency;
    return {
      asset_liability_id: id,
      value_in_original_currency: value,
      exchange_rate_to_usd: rate,
      calculated_value_usd: value * rate,
    };
  }

  // Asset added after the last snapshot — compute from current metadata.
  let localValue: number;
  if (type === "REAL_ESTATE") {
    const meta = asset.metadata as RealEstateMetadata;
    localValue = meta.sqm * meta.price_per_sqm;
  } else {
    const meta = asset.metadata as SimpleValueMetadata;
    localValue = meta.amount;
  }

  return {
    asset_liability_id: id,
    value_in_original_currency: localValue,
    exchange_rate_to_usd: rate,
    calculated_value_usd: localValue * rate,
  };
}

// ── autoFillMissedSnapshots ────────────────────────────────────────────────

/**
 * For each missed month (in chronological order), writes a snapshot with
 * is_auto_filled=1. Months are processed sequentially because each snapshot
 * is the "previous" for the next. Asset fetches within a single month run
 * in parallel.
 *
 * Failure policy (stop-and-retry): if any month's build throws (transient
 * network failure), the loop stops. Already-written months stay. getMissedMonths
 * will re-detect the gap on the next app launch and retry.
 *
 * After all months succeed, updates assets_liabilities.metadata.principal for
 * every liability to reflect the principal AFTER the last filled month — this
 * is one additional amortization cycle beyond the last snapshot's value.
 *
 * Amortization cycle count for the test scenario (April manual lock → May/Jun/Jul
 * auto-fill → this final step): 1 (April lock) + 1 (May) + 1 (Jun) + 1 (Jul)
 * + 1 (final update) = 5 total cycles from the original entered principal.
 *
 * @param onProgress called with (monthIndex, total) at the start of each month,
 *                   0-based, so (0, 3) means "processing month 1 of 3".
 */
export async function autoFillMissedSnapshots(
  missedMonths: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  if (missedMonths.length === 0) return;

  const assets = await getAllAssets();
  let lastFilledSnapshotId: string | null = null;

  for (let i = 0; i < missedMonths.length; i++) {
    const monthFirst = missedMonths[i];
    onProgress?.(i, missedMonths.length);

    const prevSnapshot = await getSnapshotBefore(monthFirst);
    const prevItems = prevSnapshot ? await getSnapshotItems(prevSnapshot.id) : [];
    const prevItemMap = new Map<string, SnapshotItem>(
      prevItems.map((item) => [item.asset_liability_id, item]),
    );

    // Fetch prices / FX for all assets in parallel, then filter out skipped ones.
    const lockItemResults = await Promise.all(
      assets.map((asset) => buildLockItem(asset, prevItemMap.get(asset.id))),
    );
    const lockItems = lockItemResults.filter((item): item is LockItemInput => item !== null);

    const snapshot = await lockSnapshot({
      items: lockItems,
      lockedAt: monthFirst,
      isAutoFilled: 1,
    });
    lastFilledSnapshotId = snapshot.id;

    if (__DEV__) {
      console.log(
        `[autofill] wrote snapshot for ${monthFirst}` +
          ` (${lockItems.length}/${assets.length} assets, is_auto_filled=1)`,
      );
    }
  }

  if (lastFilledSnapshotId === null) return;

  // ── Final principal update ───────────────────────────────────────────
  // Each auto-filled snapshot captured the liability principal AT THE START
  // of that month. One more amortization cycle advances the principal to what
  // Today should show (principal owed going into the NEXT month).
  // Continue-on-fail per item: one bad update shouldn't block others.
  const lastItems = await getSnapshotItems(lastFilledSnapshotId);
  const lastItemMap = new Map<string, SnapshotItem>(
    lastItems.map((item) => [item.asset_liability_id, item]),
  );

  for (const asset of assets) {
    if (!LIABILITY_TYPES.has(asset.type)) continue;
    const lastItem = lastItemMap.get(asset.id);
    if (!lastItem) continue;
    const meta = asset.metadata as LiabilityMetadata;
    const newPrincipal = applyAmortization(
      lastItem.value_in_original_currency,
      meta.interest_rate,
      meta.monthly_payment,
    );
    try {
      await updateAsset(asset.id, {
        metadata: {
          principal: newPrincipal,
          interest_rate: meta.interest_rate,
          monthly_payment: meta.monthly_payment,
        },
      });
    } catch (err) {
      if (__DEV__) {
        console.warn(`[autofill] principal update failed for ${asset.id}:`, err);
      }
    }
  }

  if (__DEV__) {
    console.log(`[autofill] complete — filled ${missedMonths.length} month(s), principals updated`);
  }
}
