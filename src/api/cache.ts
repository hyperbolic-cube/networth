// api_cache.value is a TEXT column. readCache/writeCache own the JSON boundary:
// writeCache JSON.stringifies, readCache JSON.parses. Therefore T must be JSON-
// serializable — primitives, plain objects/arrays only. No Date (store epoch ms),
// no Map/Set, no class instances, no functions, no undefined-valued keys.
// All three providers cache `number` (the price / fx multiplier), so this is
// comfortably satisfied; the constraint is documented for future cache users.
// fetched_at is the SQLite INTEGER column, kept out of the JSON blob.

import { db } from "../db/client";
import type { ApiResult } from "../types";
import { getNowMs } from "../utils/clock";

// ── TTL constants ──────────────────────────────────────────────────────────

export const TTL = {
  FX: 24 * 60 * 60 * 1000,
  TICKER: 60 * 60 * 1000,
} as const;

// ── Outcome type for provider fetch closures ───────────────────────────────

/**
 * The result a provider's `fetch` closure must return.
 *
 * - `{ ok: true, value }` — data was retrieved successfully.
 * - `{ ok: false, kind: "not_found" }` — symbol/currency does not exist
 *   (permanent for this input; do not fall back to stale cache).
 * - `{ ok: false, kind: "transient" }` — network or upstream error; a stale
 *   cache entry (if any) should be returned to the caller.
 */
export type FetchOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "transient" };

// ── Cache row shape (internal) ─────────────────────────────────────────────

interface CacheRow {
  key: string;
  value: string;
  fetched_at: number;
}

// ── readCache ──────────────────────────────────────────────────────────────

/**
 * Read a single entry from `api_cache`.
 * Returns `null` on miss or if the stored JSON is corrupt (warns + treats as miss).
 */
export async function readCache<T>(
  key: string
): Promise<{ value: T; fetchedAt: number } | null> {
  const row = await db.getFirstAsync<CacheRow>(
    `SELECT key, value, fetched_at FROM api_cache WHERE key = ?`,
    [key]
  );
  if (!row) return null;

  try {
    const value = JSON.parse(row.value) as T;
    return { value, fetchedAt: row.fetched_at };
  } catch (err) {
    console.warn("[api] corrupt cache entry for", key, err);
    return null;
  }
}

// ── writeCache ─────────────────────────────────────────────────────────────

/**
 * Insert or replace a cache entry (upsert by primary key).
 */
export async function writeCache<T>(
  key: string,
  value: T,
  fetchedAt: number = getNowMs()
): Promise<void> {
  await db.runAsync(
    `INSERT INTO api_cache (key, value, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
    [key, JSON.stringify(value), fetchedAt]
  );
}

// ── In-flight dedup map ────────────────────────────────────────────────────

// Keyed by cache key so different keys never block each other.
// Note: since each currency is a distinct key, simultaneous cold
// getExchangeRate calls for different currencies don't coalesce — but the
// first response warms the whole fx:* keyspace (one CDN file covers all
// codes), so subsequent calls become fresh cache hits. Acceptable: the file
// is CDN-cached and tiny.
const inflight = new Map<string, Promise<ApiResult<unknown>>>();

// ── withCache ──────────────────────────────────────────────────────────────

/**
 * Cache-aside wrapper with fresh/stale/unavailable semantics and in-flight
 * deduplication per cache key.
 *
 * 1. If a fresh cache entry exists (within TTL) → return immediately.
 * 2. If another call for the same key is already in-flight → coalesce.
 * 3. Otherwise: call `args.fetch()`.
 *    - success       → write to cache (best-effort), return "fresh".
 *    - not_found     → return "unavailable / not_found" (ignore stale cache).
 *    - transient     → return stale entry if available, else "unavailable / offline".
 */
export async function withCache<T>(args: {
  key: string;
  ttlMs: number;
  fetch: () => Promise<FetchOutcome<T>>;
}): Promise<ApiResult<T>> {
  const { key, ttlMs } = args;

  // 1. Cache hit within TTL → return immediately, no network.
  const cached = await readCache<T>(key);
  if (cached !== null && getNowMs() - cached.fetchedAt < ttlMs) {
    return { status: "fresh", value: cached.value, fetchedAt: cached.fetchedAt };
  }

  // 2. In-flight dedup: if a fetch is already running for this key, wait for it.
  if (inflight.has(key)) {
    return (await inflight.get(key)!) as ApiResult<T>;
  }

  // 3. Start a new fetch and register it.
  const p: Promise<ApiResult<unknown>> = (async (): Promise<ApiResult<T>> => {
    let outcome: FetchOutcome<T>;
    try {
      outcome = await args.fetch();
    } catch (err) {
      // Unexpected throw from the fetch closure — treat as transient.
      console.warn("[api] unexpected fetch error for", key, err);
      outcome = { ok: false, kind: "transient" };
    }

    if (outcome.ok) {
      const now = getNowMs();
      try {
        await writeCache(key, outcome.value, now);
      } catch (err) {
        console.warn("[api] cache write failed for", key, err);
        // Network value is authoritative; continue regardless.
      }
      return { status: "fresh", value: outcome.value, fetchedAt: now };
    }

    if (outcome.kind === "not_found") {
      return { status: "unavailable", reason: "not_found" };
    }

    // transient failure — serve stale if available.
    if (cached !== null) {
      return { status: "stale", value: cached.value, fetchedAt: cached.fetchedAt };
    }
    return { status: "unavailable", reason: "offline" };
  })() as Promise<ApiResult<unknown>>;

  inflight.set(key, p);
  p.finally(() => inflight.delete(key));

  return (await p) as ApiResult<T>;
}
