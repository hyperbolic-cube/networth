import type { ApiResult } from "../types";
import { TTL, FetchOutcome, withCache } from "./cache";

// ── Wire types (private) ───────────────────────────────────────────────────

interface BinanceTicker {
  symbol: string;
  price: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Returns the current USD price for a crypto symbol from Binance (USDT pair).
 *
 * Key: `crypto:{SYMBOL}`, TTL: 1 h.
 * Binance returns HTTP 400 when the USDT pair does not exist — treated as
 * "not_found" (no USDT pair / invalid symbol), not a transient error.
 */
export async function getCryptoPrice(
  symbol: string
): Promise<ApiResult<number>> {
  const s = symbol.trim().toUpperCase();

  return withCache<number>({
    key: `crypto:${s}`,
    ttlMs: TTL.TICKER,
    fetch: async (): Promise<FetchOutcome<number>> => {
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${s}USDT`;

      let response: Response;
      try {
        response = await fetchWithTimeout(url);
      } catch {
        return { ok: false, kind: "transient" };
      }

      if (response.status === 400) {
        // Binance: {"code":-1121,"msg":"Invalid symbol."} — no USDT pair.
        return { ok: false, kind: "not_found" };
      }

      if (!response.ok) {
        return { ok: false, kind: "transient" };
      }

      let body: BinanceTicker;
      try {
        body = (await response.json()) as BinanceTicker;
      } catch {
        return { ok: false, kind: "transient" };
      }

      // price is a string in the Binance API — must parseFloat.
      const price = parseFloat(body.price);
      if (!isFinite(price) || price <= 0) {
        return { ok: false, kind: "not_found" };
      }

      return { ok: true, value: price };
    },
  });
}
