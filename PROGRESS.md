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

## Phase 5: Draft View + Snapshot Lock — DEPRECATED, replaced by Phase 5b
(Phase 5 implementation was validated, but data model pivoted on 2026-05-12. Phase 5b is the active path.)

## Phase 5b: Today + Lock Window Model

### 5b.1 — DB Migration ✅
- [x] Add `is_auto_filled INTEGER DEFAULT 0` column to `snapshots` table via idempotent ALTER
- [x] Create `user_settings(key TEXT PK, value TEXT NOT NULL)` table
- [x] Seed `('edits_remaining', '3')` row on first init (DEPRECATED — see Phase 9 paywall design; row stays for now)
- [x] New file `src/db/settings.ts` with `getSetting`, `setSetting`, `getEditsRemaining`, `decrementEdits`
- [x] Test migrations on existing devices via debug panel "Reset all (incl. prices)" — verified

### 5b.2 — Today screen ✅
- [x] Rename `DraftScreen.tsx` → `TodayScreen.tsx` via git mv
- [x] Remove Lock button from screen body (returns conditionally in 5b.3)
- [x] Add "+ Add" CTA in header that switches to Grid
- [x] Update App.tsx: `useState<"grid" | "today">`, default to "today" if any assets exist, else "grid"
- [x] GridScreen CTA: "Review Snapshot" → "View Today" (when items exist)

### 5b.3 — Lock window detection + button ✅
- [x] New util `src/utils/lockWindow.ts`: isInLockWindow, getCurrentMonthSnapshotDate, getCurrentYearMonth, nextLockWindowDate, daysUntilNextLockWindow
- [x] New DB helper getSnapshotByMonth in src/db/snapshots.ts
- [x] TodayScreen renders Lock button when in lock window AND no snapshot for current month
- [x] Outside window: hint shown ("Next lock window: ...")
- [x] Lock action: lockedAt = canonical first-of-month via getCurrentMonthSnapshotDate()
- [x] Post-lock amortization placeholder in src/utils/amortization.ts (Phase 6 fills in tests + validation)
- [x] Reactivity: TodayScreen subscribes to useClockStore.mockDate for time-travel testing

### 5b.3.5 — Adaptive footer hints ✅
- [x] 5 hint variants in TodayScreen: locked / missed / first_time / outside_window / none
- [x] New DB helper getLatestAutoFilledSnapshot
- [x] Pure helper functions getHintVariant + monthNameFromLockedAt (timezone-safe string parsing)

### 5b.4 — Auto-fill missed months
- [x] New util `src/utils/autofill.ts`: getMissedMonths(lastSnapshotDate, today) and autoFillMissedSnapshots(missedMonths, onProgress)
- [x] New DB helper getSnapshotBefore in src/db/snapshots.ts
- [x] App.tsx init sequence: initDatabase → getLatestSnapshot → if missed > 0, run autofill with progress UI → load store → ready
- [x] Per-type buildLockItem logic: BANK/CASH/VEHICLE/REAL_ESTATE freeze from prev snapshot with current FX; BROKER live prices; LIABILITY cumulative amortization
- [x] Idempotent: partial failures recover on next app open via getMissedMonths re-detection
- [x] Smoke test with time travel: 3 missed months, verify cumulative amortization, verify hint variant 'missed'

### 5b.5 — Lock contract update ✅ (done in 5b.3)
- [x] lockSnapshot signature: `{ items, lockedAt, isAutoFilled }` parameter

### 5b.6 — Final Phase 5b smoke test
- [x] Reset DB, create 3 assets in Grid (Bank USD, Broker TSLA, Mortgage KZT)
- [x] Verify Today screen renders with computed values + footer math correct
- [x] Time-travel through 3 missed months, verify auto-fill correct, Mortgage principal cumulatively amortized
- [x] Verify all 5 hint variants visible in their respective conditions

## Phase 6: Auto-Amortization Math
- [x] Replace placeholder applyAmortization with PRD-spec implementation: validation (principal ≤ 0 → 0, rate < 0 → throw, payment ≤ 0 → unchanged, clamp to ≥ 0)
- [x] Install Jest + jest-expo + @types/jest as devDependencies (jest@29.7.0, jest-expo@54.0.0, @types/jest@29.5.14)
- [x] Configure jest preset in package.json (+ "test": "jest" script)
- [x] Unit tests in src/utils/__tests__/amortization.test.ts — 13 tests: 5 math cases + 6 validation + 2 integration call-site smoke tests. All pass. npx tsc --noEmit clean.
- [x] Verify applyAmortization integration in lock + autofill flows unchanged — same signature, call sites untouched

## Phase 7: Dashboard + Breakdown Table

### 7a — Navigation upgrade + Dashboard stub ✅
- [x] Install @react-navigation/native@^7.2.4, @react-navigation/native-stack@^7.15.1, react-native-screens@~4.16.0
- [x] New src/types/navigation.ts — RootStackParamList + per-screen NativeStackScreenProps types
- [x] Replace useState<"grid" | "today"> with NavigationContainer + Stack.Navigator (3 screens: Grid, Today, Dashboard)
- [x] Initial route logic: no assets → Grid; assets + no snapshots → Today; assets + snapshots → Dashboard
- [x] All headers hidden (headerShown: false) — screens own their chrome
- [x] GridScreen: removed onOpenToday prop, uses useNavigation().navigate("Today")
- [x] TodayScreen: removed onOpenGrid prop, uses useNavigation().navigate("Grid")
- [x] New DashboardScreen.tsx stub: "Dashboard — coming in Phase 7b" + "Back to Today" via navigate("Today")
- [x] npx tsc --noEmit clean. Commit: 0569272

### 7.1 — Navigation upgrade
- [x] (completed in Phase 7a above)

### 7b.1 — Dashboard Foundation + Hero + Line Chart ✅
- [x] DashboardScreen replaces stub with scrollable layout: header (Dashboard title + Today link), Hero, Line chart, dashed placeholders for Donut (7b.2) and Breakdown (7b.3)
- [x] Hero: 56pt white net-worth number (red only when net debt), delta pill ("+$X (+Y%)") in positive/negative/secondary color vs previous snapshot, "As of {Month Day, Year}" caption, "—" + "First snapshot" when only 1 snapshot exists
- [x] Line chart (gifted-charts): per-point dataPointColor/Radius (auto-filled = #0A84FF 50% alpha, radius 3; locked = solid #0A84FF, radius 5); per-segment lineSegments with strokeDashArray [4,4] when either endpoint auto-filled; pointerConfig tooltip showing date + value + "· auto" tag; y-axis labels hidden on screens <380pt (iPhone SE family); negative-aware via mostNegativeValue + noOfSectionsBelowXAxis
- [x] Empty state (0 snapshots): "Lock your first snapshot to see your wealth trend" + "Go to Today" Pressable
- [x] Subscribes to useClockStore.mockDate; refetches getAllSnapshots on time-travel changes; loading spinner while null
- [x] No new DB helpers needed — getAllSnapshots() already orders by locked_at ASC; previous = snapshots[length-2]

### 7.2 — Dashboard layout (placeholder — superseded by 7b sub-phases)

### 7.3 — Allocation donut
- [ ] Donut chart of current Today allocation by asset class
- [ ] Categories: Stocks (BROKER stock+bond), Crypto (BROKER crypto), Cash (BANK+CASH), Real Estate, Vehicles, Debt (all liabilities)
- [ ] Legend with percentages

### 7.4 — Breakdown table by month (KEY NEW FEATURE)
- [ ] Tabular component showing all snapshots in rows, asset classes in columns
- [ ] Columns: Date | Stocks | Crypto | Cash | Real Estate | Vehicles | Debt
- [ ] Each cell aggregates calculated_value_usd across assets of that class in that snapshot
- [ ] Debt column shows liabilities as negative
- [ ] Horizontally scrollable on small screens
- [ ] Tap on row → snapshot detail view (Phase 7.5)
- [ ] This mirrors user's existing Google Sheets workflow — designed for power users

### 7.5 — Snapshot detail view
- [ ] Tap snapshot in breakdown table or history → SnapshotDetailScreen
- [ ] Shows all snapshot_items for that snapshot
- [ ] "Edit" button — visible always but routes to paywall if `getSnapshotCount() >= 3` (free limit hit means edit is paid)
- [ ] Read-only view of historical lock state

### 7.6 — Empty state
- [ ] If 0 snapshots: Dashboard shows "Your first lock window: {date}" with educational copy
- [ ] If 1 snapshot: chart shows single point + "Lock more months to see your trend"

## Phase 9: Paywall + In-App Purchases (BEFORE Phase 8 polish)

### 9.1 — Pricing research
- [ ] Research competitor pricing (Monarch, Empower, Mint, Copilot, YNAB)
- [ ] Finalize: monthly price + annual price + free trial period (if any)
- [ ] Update DECISIONS.md with final pricing

### 9.2 — RevenueCat integration
- [ ] Install react-native-purchases + react-native-purchases-ui
- [ ] App Store Connect: create subscription products, screenshots, descriptions
- [ ] Google Play Console: same setup for Android
- [ ] RevenueCat dashboard: connect both stores, configure products
- [ ] App.tsx init: initialize RevenueCat with API key (in env or constants)

### 9.3 — Paywall screen
- [ ] New PaywallScreen.tsx — full-screen modal
- [ ] Three-section design: hero benefit list ("Unlimited assets, unlimited history, edit any snapshot, export to CSV"), pricing card (monthly + annual), purchase + restore buttons
- [ ] Restore purchases button (Apple requirement)
- [ ] Privacy policy + terms links (Apple requirement)
- [ ] Loading states for purchase flow
- [ ] Error states for purchase failures

### 9.4 — Paywall triggers wiring
- [ ] GridScreen: tap on tile when `getAssetsCount() >= 3 && !isPaid()` → PaywallScreen
- [ ] TodayScreen: Lock button when `getSnapshotCount() >= 3 && !isPaid()` → PaywallScreen (override the lock action)
- [ ] SnapshotDetailScreen: Edit button when `!isPaid()` → PaywallScreen
- [ ] BreakdownTable: Export CSV button when `!isPaid()` → PaywallScreen

### 9.5 — Paid state plumbing
- [ ] Zustand store slice: useEntitlementStore with `isPaid: boolean`, updates via RevenueCat listener
- [ ] Init from RevenueCat customer info on app launch
- [ ] Subscribe to entitlement changes (sub renews, cancels, expires)

### 9.6 — Settings screen (basic)
- [ ] New SettingsScreen.tsx — accessed via gear icon on Dashboard
- [ ] Current subscription status display
- [ ] Manage subscription button (links to App Store / Play Store subscription page)
- [ ] Restore purchases button (duplicate from paywall)
- [ ] App version + build number

### 9.7 — Sandbox testing
- [ ] Apple sandbox tester accounts created
- [ ] Test purchase flow on iOS Simulator + real device
- [ ] Test purchase flow on Android emulator + real device
- [ ] Test restore purchases (delete + reinstall app, restore should bring back paid status)
- [ ] Test subscription expiration / renewal scenarios

## Phase 8: Polish (LAST before release)
- [ ] Dark mode tokens (#000, #1C1C1E) — verify cross-platform
- [ ] Loading states for API fetches refined
- [ ] Error boundaries wrapping critical screens
- [ ] App icon design + production assets
- [ ] Splash screen polish (dark background, logo)
- [ ] Test on iOS + Android real devices (not just simulator)
- [ ] Onboarding hints / coach marks for first-time users (optional)
- [ ] CSV export implementation (paid feature, from Phase 7 breakdown table)

## Phase 10: Pre-Release
- [ ] App Store Connect: app metadata, screenshots, keywords, privacy policy
- [ ] Google Play Console: same
- [ ] TestFlight beta with 5-10 testers
- [ ] Address beta feedback
- [ ] Submit for review

## Dev Tooling Milestones
- [x] 2026-05-12 — Time travel (src/utils/clock.ts + src/store/clockStore.ts + debug panel controls). Unlocks Phase 5b.3 (lock window), 5b.4 (auto-fill), Phase 7 (multi-month chart) testing without waiting for real calendar.
- [x] 2026-05-11 — Debug panel on GridScreen (reset/seed buttons, dev-gated).
