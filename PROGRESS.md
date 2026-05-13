# Build Progress

## Dev Tooling Milestones
- [x] 2026-05-12 — Time travel (src/utils/clock.ts + src/store/clockStore.ts + debug panel controls). Unlocks Phase 5b.3 (lock window), 5b.4 (auto-fill), Phase 7 (multi-month chart) testing without waiting for real calendar.
- [x] 2026-05-11 — Debug panel on GridScreen (reset/seed buttons, dev-gated).

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

## Phase 5: Draft View + Snapshot Lock — DEPRECATED, see Phase 5b
- [x] (original Phase 5 implementation is complete and validated, but the data model has pivoted as of 2026-05-12 — see DECISIONS.md "MAJOR PIVOT" entry. Phase 5b replaces this.)
- [x] List of all assets with computed current values — `DraftScreen.tsx` + pure `src/utils/computeItems.ts` (per-type USD math, liabilities negative)
- [x] Sticky footer: Assets − Liabilities = Net Worth — Liabilities shown as positive under its label; Net Worth negative-aware (red)
- [x] Edit-via-numpad — new `EditValueSheet.tsx` (SheetScaffold + MoneyInput), one editable field per type
- [x] Lock button → `lockSnapshot()` single transaction
- [x] Medium haptic on lock

## Phase 5b: Today + Lock Window Model (replaces Phase 5)

**Goal:** rewire DraftScreen-as-modal into Today-as-home, add lock window detection, add auto-fill for missed months. Phase 5 code is salvaged where possible (`computeItems.ts`, `EditValueSheet.tsx`, math layer); the screen orchestration and the lock semantics change.

### 5b.1 — DB Migration
- [x] Add `is_auto_filled INTEGER DEFAULT 0` column to `snapshots` table via idempotent ALTER (catch duplicate-column error) in `src/db/schema.ts`
- [x] Create `user_settings(key TEXT PK, value TEXT NOT NULL)` table via `CREATE TABLE IF NOT EXISTS` in `src/db/schema.ts`
- [x] Seed `('edits_remaining', '3')` row on first init (INSERT OR IGNORE)
- [x] New file `src/db/settings.ts` with `getSetting`, `setSetting`, `getEditsRemaining`, `decrementEdits` (atomic SQL decrement)
- [x] Test migrations on existing devices via debug panel "Reset all (incl. prices)" — verify migrations re-run cleanly

### 5b.2 — Today screen
- [x] Rename `DraftScreen.tsx` → `TodayScreen.tsx`. Keep computeItems orchestration, row layout, edit-via-tap, EditValueSheet integration
- [x] Remove Lock button from screen body. Today screen is "always editable, no lock action".
- [x] Add "+ Add" CTA in header/footer that switches to Grid (so user can add new assets while in Today)
- [x] Update App.tsx: `useState<"grid" | "today">`, default to "today" if any assets exist, else "grid"
- [x] GridScreen's CTA renames from "Review Snapshot" → "View Today" (when items exist)

### 5b.3 — Lock window detection + button
- [x] New util `src/utils/lockWindow.ts`: `isInLockWindow`, `getCurrentMonthSnapshotDate`, `nextLockWindowDate`, `getCurrentYearMonth` — all accept optional `date` param (mock-aware via `getNow()`)
- [x] New util `src/utils/amortization.ts`: `applyAmortization(principal, annualRatePercent, monthlyPayment)` — PRD formula, placeholder for Phase 6 validation + tests
- [x] New DB helper in `src/db/snapshots.ts`: `getSnapshotByMonth(yearMonth: string): Snapshot | null` — `strftime('%Y-%m', locked_at) = ?`
- [x] TodayScreen: Lock button visible when `isInLockWindow() && !snapshotExistsForMonth`; snapshot check re-runs on `mockDate` change via `useEffect([mockDate])`
- [x] When lock button is hidden, footer shows "Next lock window: {nextLockWindowDate()}" hint
- [x] Lock action: `lockSnapshot({ items, lockedAt: getCurrentMonthSnapshotDate(), isAutoFilled: 0 })`. Post-lock: amortize all liabilities with continue-on-fail per item. FOOTER_HEIGHT bumped to 190.

### 5b.4 — Auto-fill missed months
- [ ] New util `src/utils/autofill.ts`:
  - `getMissedMonths(lastSnapshotDate: string | null, today = new Date()): string[]` — returns list of `YYYY-MM-01` for each missed month
  - `autoFillMissedSnapshots(missedMonths: string[]): Promise<void>` — for each, in order, build a snapshot from previous (or current `assets_liabilities` if no prior) + amortization, write transactionally
- [ ] On App.tsx startup (after initDatabase, before first render), call auto-fill. Show loading state while running.
- [ ] Auto-filled snapshots get `is_auto_filled = 1`
- [ ] After auto-fill: also update liabilities' `assets_liabilities.metadata.principal` to reflect cumulative amortization

### 5b.5 — Lock contract update
- [x] `lockSnapshot()` signature updated: accepts `{ items, lockedAt, isAutoFilled }` parameter. Done in Phase 5b.3 (lockedAt is load-bearing for canonical timestamp; deferring would have required a second pass on the same function).
- [x] Snapshots inserted with explicit `is_auto_filled` column. TodayScreen call site updated.
- [x] `Snapshot` type already exposes `is_auto_filled: 0 | 1` from Phase 5b.1.

### 5b.6 — Smoke test
- [ ] Reset DB, create 3 assets in Grid (Bank USD, Broker TSLA, Mortgage KZT)
- [ ] Verify Today screen renders with computed values + footer math correct
- [ ] If today is day 1–5: verify Lock button visible, lock works, snapshot has `is_auto_filled = 0`, principal in `assets_liabilities` decremented
- [ ] If today is day 6+: verify Lock button hidden + hint shown
- [ ] Test auto-fill: manually insert a snapshot with `locked_at = 2026-01-01`, reload app, verify Feb / Mar / Apr (etc.) auto-fills appear with `is_auto_filled = 1`, liabilities cumulatively amortized

## Phase 6: Auto-Amortization (refocused — now smaller, math-only)
- [ ] Pure function in `src/utils/amortization.ts` implementing PRD formula with validation (principal ≤ 0 → 0, rate < 0 → throw, payment ≤ 0 → unchanged, clamp result to ≥ 0)
- [ ] Unit tests (Jest + jest-expo) with 4–5 hand-calculated cases (normal, final-payment clamp, interest-only identity, zero-rate, already-paid)
- [ ] `applyAmortization()` wired into Phase 5b lock + auto-fill flows
- [ ] Ghost values in EditValueSheet — per-type derivation from `getSnapshotItems(latestSnapshot.id)` map (BANK/CASH/VEHICLE: amount; MORTGAGE/CREDIT_DEBT/AUTO_LOAN: principal; REAL_ESTATE: price/sqm with impure derivation; BROKER: no ghost)

## Phase 7: Dashboard
- [ ] Net worth hero (most recent snapshot) + delta vs previous snapshot
- [ ] Line chart over time — auto-filled snapshots rendered with dashed line / lighter dot
- [ ] Donut chart for allocation
- [ ] History list (scrollable, oldest → newest, tappable)
- [ ] Today vs. Last Snapshot card
- [ ] Empty state when no snapshots exist
- [ ] Add `@react-navigation/native-stack` (per DECISIONS.md nav plan) for Dashboard ↔ Today ↔ Snapshot Detail nav

## Phase 8: Polish
- [ ] Dark mode tokens (#000, #1C1C1E) — verify cross-platform
- [ ] Loading states for API fetches
- [ ] Error boundaries
- [ ] Test on iOS + Android
- [ ] App icon, splash screen polish

## Phase 9: Paywall + Edit Credit Gating
- [ ] Snapshot detail screen — shows the snapshot's items, has "Edit" button
- [ ] "Edit" button checks `getEditsRemaining()`. If > 0, enters edit mode; if 0, shows paywall.
- [ ] Edit mode: similar to Today but scoped to one snapshot. User edits any/all fields, can add/delete assets. On Save: overwrite `snapshot_items`, recompute `total_net_worth_usd`, decrement `edits_remaining` via `decrementEdits()`.
- [ ] Paywall screen (placeholder copy + button — actual IAP integration is post-MVP)
- [ ] In-app counter visible somewhere ("3 free edits remaining")
