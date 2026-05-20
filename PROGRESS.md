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

### 7.2 — Dashboard layout ✅
- [x] DashboardScreen.tsx with scrollable container, header, hero section
- [x] Hero: most recent snapshot net worth, delta vs previous, color-aware
- [x] Line chart (react-native-gifted-charts) with auto-filled visual distinction
- [x] Pointer tooltip on tap showing date + USD value
- [x] Data-shift workaround for all-negative case (library bug)
- [x] Single-snapshot edge case (— delta, lone dot)
- [x] Empty state (deferred testing, code in place)

### 7.3 — Allocation donut
- [x] Donut chart of current Today allocation by asset class
- [x] Categories: Stocks (BROKER stock+bond), Crypto (BROKER crypto), Cash (BANK+CASH), Real Estate, Vehicles, Debt (all liabilities)
- [x] Legend with percentages

### 7b.2 — Donut allocation chart + asset class aggregation ✅
- [x] New util `src/utils/assetClass.ts`: AssetClass union, ASSET_CLASSES const, exhaustive classifyAsset switch (throws on unreachable type), aggregateByClass(assets) → ClassTotals via Promise.all(computeItem)
- [x] DonutSection in DashboardScreen replaces UpcomingPlaceholder "Allocation"
- [x] gifted-charts PieChart in donut mode (radius 90 / innerRadius 54), animated 600ms, center label "Assets" + total USD (assets-only denominator, not net worth)
- [x] iOS-system color palette: Stocks #0A84FF, Crypto #5E5CE6, Cash #30D158, RealEstate #FF9F0A, Vehicles #BF5AF2, Debt #FF453A
- [x] Legend rows (color swatch + class name + $ value + % share), sorted by absolute value desc, near-zero (|<$0.01|) classes filtered
- [x] Wide layout (≥380pt): donut + legend side-by-side. Narrow: donut above legend.
- [x] Debt handled as separate horizontal red bar below donut (option c — honest financially, debt is not a "share of allocation")
- [x] Empty state: "Add assets to see your allocation" + Go to Grid CTA when no positive assets (debt bar still renders if debt exists)
- [x] Subscribes to mockDate for time-travel-consistent re-fetch
- [x] npx tsc --noEmit clean

### 7b.3 — Breakdown table by month + SnapshotDetail stub ✅
- [x] New util `aggregateSnapshotByClass(snapshotId, assetsById)` in src/utils/assetClass.ts — reads snapshot_items, classifies via shared map (no N+1), sign-based fallback for deleted assets (dev warn)
- [x] BreakdownTableSection inside DashboardScreen: sticky 88pt Date column + horizontally-scrollable 84pt class columns (Stocks | Crypto | Cash | Real Est. | Vehicles | Debt). Fix: Date rendered ONCE in the sticky left column (the prior layout duplicated it inside each scrollable row); widened from 72→88pt so "··· Jun '26" doesn't truncate; date format uses an apostrophe ("Mar '26") to disambiguate from "March 26th"
- [x] Row alignment fix: upgrade prompt promoted to full-width banner above the columns (was inside the scrollable side with a fragile empty mirror spacer on the sticky side); sticky column now renders a real "DATE" header instead of an empty spacer; new BreakdownDateRow component mirrors BreakdownBodyRow's flex/centering exactly so date text and value text share the same vertical baseline within each row. Symmetric row counts on both halves guarantee alignment by construction.
- [x] Oldest-first ordering (matches the chart's left=old→right=new visual flow)
- [x] Compact number formatting ($450 / $12k / $1.2M) via formatCompactMoney
- [x] Empty cells render as em dash (—) not "$0"
- [x] Auto-filled rows: faded text + "··· " prefix on the date label (mirrors chart legend symbol)
- [x] Debt column always NEGATIVE red regardless of locked/auto state
- [x] Free-tier paywall stub: cap at 3 visible rows (most recent 3, preserved internal oldest→newest order); "Upgrade to see all N snapshots →" prompt at top → Alert "Coming soon — Phase 9"
- [x] Tap row → navigates to SnapshotDetail with snapshotId
- [x] SnapshotDetail added to RootStackParamList; new src/screens/SnapshotDetailScreen.tsx stub (back + Edit-paywall alert + receives snapshotId display)
- [x] Stack.Screen registered in App.tsx
- [x] npx tsc --noEmit clean

### 7.5 — Snapshot detail view (full content)
- [x] Routing stub shipped in 7b.3 (back button + Edit→paywall alert)
- [ ] Phase 7c: render snapshot_items list with name/type/values
- [ ] Phase 7c: read-only view of historical lock state
- [ ] Phase 9: Edit button routes to paywall when not paid

### 7.6 — Empty state
- [ ] If 0 snapshots: Dashboard shows "Your first lock window: {date}" with educational copy
- [ ] If 1 snapshot: chart shows single point + "Lock more months to see your trend"

## Phase 9: Paywall + In-App Purchases (BEFORE Phase 8 polish)

## Phase 9.1: Pricing research ✅
- [x] Research competitor pricing (Monarch $14.99/$99.99, YNAB $14.99/$109, Copilot $13/$95, Tiller $79, SheetLink $4.99/$39.99)
- [x] Finalize: $4.99/mo + $29.99/yr, no trial (free tier serves as trial)
- [x] Update DECISIONS.md with final pricing (2026-05-20 entry)

### 9.2 — RevenueCat integration
- [x] Install react-native-purchases + react-native-purchases-ui (v10.1.1 via npx expo install; config plugin added to app.json)
- [ ] App Store Connect: create subscription products, screenshots, descriptions
- [ ] Google Play Console: same setup for Android
- [ ] RevenueCat dashboard: connect both stores, configure products
- [x] App.tsx init: initRevenueCat() (EXPO_PUBLIC_ env keys, warn-and-return if missing) + setupRCListener() after initClock()

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
- [x] Zustand store slice: useEntitlementStore with `isPaid: boolean`, updates via RevenueCat listener (src/store/entitlementStore.ts)
- [x] Init from RevenueCat customer info on app launch (useEntitlementStore.refresh() at end of App init effect)
- [x] Subscribe to entitlement changes — addCustomerInfoUpdateListener fires _setFromCustomerInfo on purchase/expire/restore
- [x] Helper utils: useIsPaid() hook + getPaywallTrigger(reason) non-hook utility (src/utils/entitlement.ts)

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
- [ ] Add delete asset functionality (swipe-to-delete on Today, or delete button in edit sheet)
- [ ] Allow quantity 0 as valid input (or guide user to "delete" action explicitly)
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
