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
- [ ] /src/api/fx.ts — Fawazahmed0 Currency API with 24h cache (cdn.jsdelivr.net + fallback CDN)
- [ ] /src/api/tickers.ts — stocks via Cloudflare Worker proxy, crypto via Binance API; 1h cache
- [ ] Offline graceful degradation (return stale cache on fetch failure)

## Phase 4: Asset Grid + Bottom Sheets
- [ ] Grid screen with 8 preset tiles
- [ ] Bottom sheet: Bank/Cash (single number input)
- [ ] Bottom sheet: Broker (Stock/Bond toggle, ticker, quantity, live price preview)
- [ ] Bottom sheet: Real Estate (sqm × price/sqm)
- [ ] Bottom sheet: Vehicle (current value)
- [ ] Bottom sheet: Liabilities (principal, rate, monthly payment)
- [ ] Haptics on every numeric tap

## Phase 5: Draft View + Snapshot Lock
- [ ] List of all assets with computed current values
- [ ] Sticky footer: Assets − Liabilities = Net Worth
- [ ] Edit-via-numpad with previous value as ghost placeholder
- [ ] Lock button → write to snapshots + snapshot_items in single transaction
- [ ] Medium haptic on lock

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