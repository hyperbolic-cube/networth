# Build Progress

## Phase 1: Foundation
- [x] Install deps: zustand, expo-sqlite, nativewind, @gorhom/bottom-sheet, expo-haptics, react-native-gifted-charts, expo-crypto (+ peers: reanimated, gesture-handler, safe-area-context, svg, tailwindcss@3.4.17)
- [x] Configure NativeWind (tailwind.config.js, babel.config.js, metro.config.js, global.css, nativewind-env.d.ts)
- [x] Set up folder structure: /src/{db,api,store,screens,components,types,utils}
- [x] Define TypeScript types for Asset, Liability, Snapshot, SnapshotItem in /src/types

## Phase 2: Database Layer
- [x] Implement schema migrations in /src/db/schema.ts (3 tables per PRD section 3)
- [x] CRUD functions for assets_liabilities (src/db/assets.ts)
- [x] CRUD functions for snapshots + snapshot_items — transactional via withTransactionAsync (src/db/snapshots.ts)
- [x] Seed/reset utility for dev (src/db/dev.ts)

## Phase 3: API Layer
- [x] Add api_cache table to schema.ts (key, value, fetched_at — TTL: 24h FX / 1h tickers) — commit b79dc32
- [x] /src/api/cache.ts — shared withCache helper: fresh/stale/unavailable policy, in-flight dedup per key, best-effort cache I/O
- [x] /src/api/fx.ts — Fawazahmed0 Currency API, 24h cache, jsdelivr→pages.dev fallback, whole-file cache warming on success
- [x] /src/api/crypto.ts — Binance public API (USDT pair, string-price parseFloat), 1h cache
- [x] /src/api/stocks.ts — Cloudflare Worker proxy (networth-proxy.hyperbolic-cube.workers.dev), 1h cache
- [x] Offline graceful degradation — withCache returns "stale" on transient failure if prior cache entry exists, else "unavailable/offline"; "not_found" is permanent and bypasses stale fallback

## Phase 4: Asset Grid + Bottom Sheets
- [x] Grid screen with 8 preset tiles (GridScreen.tsx; 2-col flex-wrap layout; no AUTO_LOAN tile per DECISIONS.md)
- [x] Bottom sheet: Bank/Cash/Vehicle — one `SimpleValueSheet.tsx` parameterised by assetType (name + amount + SegmentedToggle currency; not 3 separate sheets)
- [x] Bottom sheet: Broker — `BrokerSheet.tsx` with `mode="stock"` (Stock/Bond toggle, ticker, quantity, PricePreview) and `mode="crypto"` reuse (fixed CRYPTO instrumentType, Binance price)
- [x] Bottom sheet: Real Estate — `RealEstateSheet.tsx` (sqm × price/sqm with live total preview)
- [x] Bottom sheet: Vehicle — handled by SimpleValueSheet assetType="VEHICLE" (current market value)
- [x] Bottom sheet: Liabilities — `LiabilitySheet.tsx` with `liabilityType` prop for MORTGAGE/CREDIT_DEBT (principal + interest_rate + monthly_payment + currency)
- [x] Haptics on every numeric tap via `src/utils/haptics.ts` (tapLight/tapMedium/notifySuccess; fire-and-forget try/catch wrappers)

## Phase 5: Draft View + Snapshot Lock
- [x] List of all assets with computed current values — `DraftScreen.tsx` + pure `src/utils/computeItems.ts` (per-type USD math, liabilities negative); fetch-on-mount via `computeItem`, `withCache` handles TTL; assets-first / liabilities-last sort; nav switch via `useState<"grid"|"draft">` in `App.tsx`, "Review Snapshot" CTA footer in `GridScreen.tsx`
- [x] Sticky footer: Assets − Liabilities = Net Worth — Liabilities shown as positive under its label; Net Worth negative-aware (red)
- [x] Edit-via-numpad — new `EditValueSheet.tsx` (SheetScaffold + MoneyInput), one editable field per type (amount / price_per_sqm / quantity / principal); broker price fetch failures get an ephemeral manual-price override (snapshot_items only, never written to assets_liabilities). Ghost/previous-value placeholder deferred to Phase 6 (no prior snapshot on first lock)
- [x] Lock button → `lockSnapshot()` single transaction; disabled while loading, on unavailable prices, or empty list; post-lock shows inline "Snapshot locked" then returns to Grid (Dashboard is Phase 7)
- [x] Medium haptic on lock — `tapMedium()` + `notifySuccess()`; numpad taps already fire `tapLight()` via MoneyInput

## Phase 6: Auto-Amortization
- [ ] Pure function in /src/utils/amortization.ts implementing PRD formula
- [ ] Unit test against 3 known cases (paste expected values)
- [ ] Wire into draft generation when previous snapshot exists

## Phase 7: Dashboard
- [ ] Net worth hero + delta vs previous snapshot
- [ ] Line chart over time
- [ ] Donut chart for allocation
- [ ] Empty state when no snapshots exist

## Phase 8: Polish
- [ ] Dark mode tokens (#000, #1C1C1E)
- [ ] Loading states for API fetches
- [ ] Error boundaries
- [ ] Test on iOS + Android