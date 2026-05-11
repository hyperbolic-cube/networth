import type { ApiResult } from "../types";
import { TTL, FetchOutcome, withCache, writeCache } from "./cache";

// ── Wire types (private) ───────────────────────────────────────────────────

interface FawazResponse {
  date: string;
  usd: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIMARY_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const FALLBACK_URL =
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json";

/** Fetch a URL with an AbortController-based timeout. */
async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the exchange rate multiplier such that:
 *   `localAmount * rate = usdAmount`
 * i.e. `rate = 1 / usd[currency]` from the Fawazahmed0 response.
 *
 * Delegates to withCache (key `fx:{CURRENCY}`, TTL 24 h) with a fetch closure
 * that tries the jsdelivr CDN first and falls back to the pages.dev mirror.
 * On success the entire file is used to warm every `fx:*` key in the cache.
 */
export async function getExchangeRate(
  currency: string
): Promise<ApiResult<number>> {
  // USD → 1 with no network call, no cache lookup. This is checked by
  // structure (early return before any I/O), not by test, until Phase 6
  // brings a test runner.
  if (currency.toUpperCase() === "USD") {
    return { status: "fresh", value: 1, fetchedAt: Date.now() };
  }

  const code = currency.toUpperCase();

  return withCache<number>({
    key: `fx:${code}`,
    ttlMs: TTL.FX,
    fetch: async (): Promise<FetchOutcome<number>> => {
      // Try primary CDN, then fallback.
      let response: Response;
      try {
        response = await fetchWithTimeout(PRIMARY_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        try {
          response = await fetchWithTimeout(FALLBACK_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch {
          return { ok: false, kind: "transient" };
        }
      }

      let data: FawazResponse;
      try {
        data = (await response.json()) as FawazResponse;
      } catch {
        return { ok: false, kind: "transient" };
      }

      const requestedRate = data.usd[currency.toLowerCase()];
      if (
        requestedRate === undefined ||
        requestedRate === 0 ||
        !isFinite(requestedRate)
      ) {
        return { ok: false, kind: "not_found" };
      }

      // Warm the entire cache: for every entry in the file, write fx:{CODE}.
      // A failed individual write is warned and skipped — the requested
      // currency's correctness is what matters.
      const now = Date.now();
      for (const [entryCode, entryRate] of Object.entries(data.usd)) {
        if (!isFinite(entryRate) || entryRate <= 0) continue;
        try {
          await writeCache(`fx:${entryCode.toUpperCase()}`, 1 / entryRate, now);
        } catch (err) {
          console.warn("[api] bulk fx cache write failed for", entryCode, err);
        }
      }

      // withCache will also write fx:{code} again — harmless double-write.
      return { ok: true, value: 1 / requestedRate };
    },
  });
}
