# Architecture Decisions Log

Running log of choices that deviate from defaults, pin specific versions, or lock in
external contracts (API endpoints, formulas, schemas). Append-only. Each entry: what,
why, when. Newer entries supersede older ones — never edit or delete past entries;
add a new dated entry instead.

---

## 2026-05-08 — Tailwind pinned to 3.4.17
NativeWind v4 does not support Tailwind v4. Do not upgrade `tailwindcss` past 3.x
until NativeWind ships explicit Tailwind 4 support. Upgrading will silently break
all styling.

## 2026-05-08 — Project docs live inside `networth/`, not parent `NW App/`
`CLAUDE.md`, `PRD.md`, `PROGRESS.md`, `DECISIONS.md` are tracked in the `networth/`
git repo. The parent `NW App/` is a workspace folder with no special meaning.
Always launch Claude Code from inside `networth/` so `CLAUDE.md` auto-loads.

## 2026-05-08 — External API endpoints (Phase 3)

**CRITICAL DECISION: NO YAHOO FINANCE.**
Yahoo Finance APIs now strictly require Crumb/Cookie authentication and block standard
fetch requests with 429 errors. We will NOT use Yahoo Finance under any circumstances.
This overrides PRD.md sections 2 and 7, which still mention Yahoo as an option.

**FX rates: Fawazahmed0 Currency API**
- Base URL: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
- Fallback CDN: `https://latest.currency-api.pages.dev/v1/currencies/usd.json`
- Description: Serves a static JSON of all currencies against USD. 100% free, CDN-backed, no auth, no rate limits.
- Response shape: `{ date: "2026-05-08", usd: { kzt: 440.50, eur: 0.92, ... } }`
- Note: currency codes in response are lowercase (`usd`, `kzt`, `eur`). Normalize at the API layer boundary.
- Logic: Fetch the `/usd.json` file once. If base is USD and local is KZT, the multiplier is simply `response.usd.kzt`.
- Caching: Update cache once every 24 hours.

**Crypto Prices: Binance Public API**
- Base URL: `https://api.binance.com/api/v3/ticker/price?symbol={TICKER}`
- Example Ticker Format: `BTCUSDT`, `ETHUSDT` (must append USDT).
- Price field in response: `price` — **note: returned as a string, not a number**. Parse to float at the API layer.
- No auth required. Extremely stable.
- Caveat: Binance is geo-blocked in some regions (US notably). Fine for KZ users; revisit if shipping globally.
- Caveat: not every coin has a USDT pair. Handle "symbol not found" gracefully.

**Stock Prices: Private Proxy via Cloudflare Worker**
- See dedicated entry below (2026-05-11) for the verified deployed contract.
- Rationale for proxy: Finnhub requires an API key; we never put API keys in the mobile client. Proxy handles the key and caching.

**Cache strategy**
- Single SQLite table: `api_cache(key TEXT PRIMARY KEY, value TEXT, fetched_at INTEGER)` — already in schema.ts as of commit b79dc32.
- TTL: 24 hours for FX, 1 hour for Tickers (both crypto and stocks).
- On fetch: check cache → if fresh, return → if stale or missing, fetch → on success update cache → on failure return stale cache (or signal unavailable if none).
- Key naming convention: `fx:{CURRENCY}`, `crypto:{SYMBOL}`, `stock:{SYMBOL}` (e.g. `fx:KZT`, `crypto:BTC`, `stock:TSLA`).

## 2026-05-11 — Cloudflare Worker for stock prices: deployed and verified

Supersedes the placeholder description in the 2026-05-08 entry above. This is the
authoritative contract for the stock price endpoint.

- Endpoint: `https://networth-proxy.hyperbolic-cube.workers.dev/price?symbol={TICKER}`
- Response (200): `{ symbol, price, currency, cached, fetched_at }`
  - `price` is a number in USD
  - `currency` is always `"USD"` (Finnhub /quote returns USD for US-listed tickers; non-US tickers not supported in current implementation)
  - `cached` is boolean — true if served from Cloudflare edge cache
  - `fetched_at` is ms timestamp of the original Finnhub fetch (not of the cached response)
- Errors (all return JSON `{ error: string, ... }`):
  - 400: invalid or missing symbol (regex `^[A-Z0-9.\-]{1,10}$`)
  - 404: symbol not found, or Finnhub returned price=0
  - 500: fetch failed (network error inside Worker)
  - 502: Finnhub upstream returned non-2xx
- Upstream: Finnhub `/api/v1/quote`, key stored as Cloudflare Worker Secret named `FINNHUB_API_KEY` (no longer hardcoded in source).
- Cache: Cloudflare edge cache, 1h TTL via `Cache-Control: public, max-age=3600`.
- Verified via curl on 2026-05-11: TSLA, AAPL return real prices; `cached` flag flips correctly on repeat call; invalid/unknown symbols return 404; root `/` returns 404.
- Source: code currently managed via Cloudflare dashboard ("Edit Code") only. Not yet in git.
  **TODO**: migrate to a wrangler-managed local repo before treating this as production. Without git, there is no history of changes to Worker code.