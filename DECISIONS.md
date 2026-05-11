# Architecture Decisions Log

Running log of choices that deviate from defaults, pin specific versions, or lock in
external contracts (API endpoints, formulas, schemas). Append-only. Each entry: what,
why, when.

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
Yahoo Finance APIs now strictly require Crumb/Cookie authentication and block standard fetch requests with 429 errors. We will NOT use Yahoo Finance under any circumstances.

**FX rates: Fawazahmed0 Currency API**
- Base URL: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
- Fallback CDN: `https://latest.currency-api.pages.dev/v1/currencies/usd.json`
- Description: Serves a static JSON of all currencies against USD. 100% free, CDN-backed, no auth, no rate limits.
- Response shape: `{ date: "2026-05-08", usd: { kzt: 440.50, eur: 0.92, ... } }`
- Logic: Fetch the `/usd.json` file once. If base is USD and local is KZT, the multiplier is simply `response.usd.kzt`. 
- Caching: Update cache once every 24 hours.

**Crypto Prices: Binance Public API**
- Base URL: `https://api.binance.com/api/v3/ticker/price?symbol={TICKER}`
- Example Ticker Format: `BTCUSDT`, `ETHUSDT` (must append USDT). 
- Price field in response: `price`
- No auth required. Extremely stable.

**Stock Prices: Private Proxy via Cloudflare Worker**
- Base URL: `https://networth-proxy.hyperbolic-cube.workers.dev/price?symbol={TICKER}`
- Description: The app fetches from our proxy. The proxy handles the Finnhub API key and caching.
- Logic: Never put API keys in the mobile client. Always fetch via this proxy.

**Cache strategy**
- Single SQLite table: `api_cache(key TEXT PRIMARY KEY, value TEXT, fetched_at INTEGER)`
- TTL: 24 hours for FX, 1 hour for Tickers.
- On fetch: check cache → if fresh, return → if stale or missing, fetch → on success update cache → on failure return stale cache (or null if none).