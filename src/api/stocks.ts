import type { ApiResult } from "../types";
import { TTL, FetchOutcome, withCache } from "./cache";

// ── Wire types (private) ───────────────────────────────────────────────────

interface WorkerPrice {
  symbol: string;
  price: number;
  currency: string;
  cached: boolean;
  fetched_at: number;
}

interface WorkerError {
  error: string;
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
 * Returns the current USD price for a stock symbol via the Cloudflare Worker proxy.
 *
 * Key: `stock:{SYMBOL}`, TTL: 1 h.
 * Status 400 and 404 are treated as "not_found" (bad/unknown symbol — permanent
 * for this input). Status 500, 502, or network errors are treated as "transient".
 */
export async function getStockPrice(
  symbol: string
): Promise<ApiResult<number>> {
  const s = symbol.trim().toUpperCase();

  return withCache<number>({
    key: `stock:${s}`,
    ttlMs: TTL.TICKER,
    fetch: async (): Promise<FetchOutcome<number>> => {
      const url = `https://networth-proxy.hyperbolic-cube.workers.dev/price?symbol=${encodeURIComponent(s)}`;

      let response: Response;
      try {
        response = await fetchWithTimeout(url);
      } catch {
        return { ok: false, kind: "transient" };
      }

      if (response.status === 200) {
        let body: WorkerPrice;
        try {
          body = (await response.json()) as WorkerPrice;
        } catch {
          return { ok: false, kind: "transient" };
        }

        if (
          typeof body.price === "number" &&
          isFinite(body.price) &&
          body.price > 0
        ) {
          return { ok: true, value: body.price };
        }
        return { ok: false, kind: "not_found" };
      }

      if (response.status === 404 || response.status === 400) {
        // 404: symbol not found / price=0. 400: bad symbol (permanent).
        return { ok: false, kind: "not_found" };
      }

      // 500, 502, or any other non-2xx — transient upstream failure.
      return { ok: false, kind: "transient" };
    },
  });
}
