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

  ## 2026-05-11 — Crypto handled as BROKER subtype, not top-level type

The PRD grid has a ₿ Crypto tile, but the type system has no CRYPTO AssetType.
Decision: add "CRYPTO" to BrokerMetadata.instrumentType (alongside "STOCK" |
"BOND"). The Crypto grid tile opens BrokerSheet in crypto mode (label "Symbol
e.g. BTC", routes to getCryptoPrice instead of getStockPrice).

Rationale: BROKER already models ticker + quantity + price-fetch, which is
exactly the crypto flow. A top-level CRYPTO type would ripple into CRUD,
ItemType, and computed-value logic for no semantic gain. Filter by
metadata.instrumentType when crypto-specific UI is needed later.

## 2026-05-11 — LiabilityMetadata gains `principal: number`

The PRD liability sheet collects 3 fields (principal, annual rate, monthly
payment) and Phase 6 amortization requires the principal. Adding now while
the surface area is small. The assets_liabilities table is unchanged —
principal lives in the JSON metadata column, same as for other asset types.

## 2026-05-11 — AUTO_LOAN deferred from Phase 4 grid

Enum value AUTO_LOAN stays in AssetType, but no grid tile in Phase 4 (PRD
specifies 8 tiles, AUTO_LOAN is not one of them). Same UX as MORTGAGE when
needed; adding the tile is ~5 min of work. Defer until a user actually
requests it post-launch.

## 2026-05-11 — Stock prices: US-listed tickers only (current Worker contract)

Cloudflare Worker → Finnhub /quote returns USD prices for US-listed tickers
(NYSE/NASDAQ). Non-US tickers return 404, indistinguishable from "not
found" in the API contract. For MVP this is accepted:
- US is the primary target market.
- KZ users (including the developer) typically hold US-listed positions
  for stocks; local KASE listings can be entered manually via a generic
  asset type if needed.

UX implications:
- BrokerSheet hint under ticker field: "US-listed tickers (e.g. TSLA, AAPL)"
- Error copy on 404: "Symbol not found. Currently supports US-listed tickers only."

International support is a Worker-side change (Finnhub /stock/profile2 for
currency lookup + FX conversion to USD), deferred until post-launch demand.
## 2026-05-11 — Phase 4 MVP scope cuts (US primary market, ship fast)

Approved adjustments that trim Phase 4 surface area. Recorded here because they
deviate from the PRD's literal UI breakdown (PRD §5 lists per-type sheets).

- **No `CurrencyInput` component.** Currency is picked via a 4-option
  `SegmentedToggle` (USD / KZT / EUR / RUB), rendered inline in the sheets that
  need it. Default USD. A free-text/searchable currency picker is post-launch.
- **One `SimpleValueSheet.tsx`, not three.** Bank, Cash and Vehicle sheets are
  all "name + amount + currency" with different labels/emoji — implemented as a
  single component parameterized by asset type. BrokerSheet, RealEstateSheet and
  LiabilitySheet stay separate (genuinely different fields).
- **`Typography.tsx` ships 3 variants:** `Display`, `Body`, `Caption`. `Heading`
  and `Mono` get added when a screen actually needs them, not before.
- **Bottom-sheet snap points: single `["85%"]` for every sheet.** No
  complex-vs-simple differentiation yet.
- **Live ticker price-preview debounce: 400 ms** (not 800 ms). The stock Worker
  is Cloudflare-edge-cached and crypto hits Binance directly; perceived lag costs
  more than the extra requests at this scale.
- **No JS numeric sanitisation on amount inputs.** Rely on
  `keyboardType="decimal-pad"` / `"numeric"` — the system keyboard already blocks
  non-numeric entry. Ticker inputs keep client-side auto-uppercase.

## 2026-05-11 — `react-native-worklets` stays a transitive dependency

Reanimated 4 pulls in `react-native-worklets` and Expo SDK 54's
`babel-preset-expo` wires its Babel plugin automatically. We do **not** add it to
`package.json` as a direct dependency. Policy: add a dependency only when it
solves a concrete problem in the change being made today.

## 2026-05-11 — Navigation: deferred, with a written handoff

Phase 4 ships a single screen, no router. The deferral path (to be left as a
comment in `App.tsx`):
- **Phase 4** — `GridScreen` only, no navigation.
- **Phase 5** — `useState<"grid" | "draft">` to switch between Grid and Draft.
  Still no router library.
- **Phase 7** — add `@react-navigation/native-stack` when Dashboard ↔ history
  back-navigation actually needs a stack.
- Do **not** add `expo-router` at any phase.

## 2026-05-11 — Known issue: Binance 451 misclassified as offline for US users

crypto.ts classifies HTTP 451 (Unavailable for Legal Reasons) as transient,
which surfaces in PricePreview as "Price unavailable — check your connection."
This is misleading: Binance geo-blocks the US entirely, so for US users (the
primary market) this is permanent, not network-related.

Post-launch fix (Phase 9+, before US marketing push):
- crypto.ts: map HTTP 451 to a new FetchOutcome kind, e.g. "geo_blocked"
- ApiResult: add "unavailable" reason "geo_blocked"
- PricePreview: copy becomes "Crypto prices unavailable in your region — enter manually"
- Long-term: route crypto through the Cloudflare Worker proxy (same pattern as
  stocks), since Workers don't have user-IP geo issues. Worker would proxy to
  Binance, CoinGecko, or another provider.

MVP behavior is acceptable for KZ dogfooding (Binance works in KZ). Track via
user feedback after US launch — if anyone hits this, fix immediately.

## 2026-05-11 — react-native-worklets pinned as direct dependency (reverses earlier decision)

The earlier 2026-05-11 entry ("worklets stays transitive") broke at runtime:
Reanimated 4.1.x + transitive worklets 0.8.x threw `TurboModule method
"installTurboModule" called with 1 arguments (expected 0)` on app boot,
even though TypeScript compiled cleanly. The runtime crash — not an
expo-doctor warning — is what forced the change.

Resolved by `npx expo install react-native-worklets`, which Expo's resolver
pinned to a SDK-54-compatible version (0.5.1) and added to package.json
dependencies.

This supersedes the earlier "transitive only" decision. The general rule
("don't add deps without reason") still stands; Reanimated 4 specifically
requires worklets as a direct dep, and the boot crash is the reason.

If a future npm prune or lockfile rebuild ever drops it, the app won't
boot on either platform. This file is where to look.

## 2026-05-12 — Known issue: broker price overrides lost on adjacent row edit

In DraftScreen, manual broker price overrides (set when network/Worker
unavailable) live in screen-local state, not in assets_liabilities or any
persisted store. If the user edits an adjacent row (Cash amount, etc.),
assetsStore.update triggers a reload + recompute, which re-fetches all
broker prices. Failed re-fetches return unavailable, wiping the override.

User workaround: re-enter the manual price. Lock button re-disables until
all unavailables are re-overridden.

Fix (deferred): track overrides in a separate Map<itemId, override>
in DraftScreen state that survives recompute, only cleared on row delete
or successful network fetch. ~30 min of work. Defer until first user
report or until offline-heavy use cases become target market.
