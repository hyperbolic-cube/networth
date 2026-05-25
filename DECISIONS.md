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

## 2026-05-12 — Phase 5 end-to-end math validated

Manual smoke test on Android: created Bank (USD), Broker stock (TSLA),
and Mortgage (KZT). Lock Snapshot completed; verified via console.log
of latest snapshot + items:

- Sum of items[].calculated_value_usd === total_net_worth_usd
  (5000 + 4450 + (-108472.32) = -99022.32, exact match to all digits)
- Liability calculated_value_usd correctly negative
- KZT exchange_rate_to_usd ≈ 0.00217 (inverse of ~461 KZT/USD, realistic)
- Broker exchange_rate_to_usd hardcoded to 1 (no FX call for broker)

Phase 5 correctness chain is solid; downstream phases (amortization,
dashboard) can rely on snapshot data being trustworthy.

## 2026-05-12 — Real Estate ghost values: impure derivation accepted for MVP

For Real Estate liabilities in EditValueSheet, the ghost placeholder for
price_per_sqm is computed as snapshotItem.value_in_original_currency /
current_metadata.sqm. This is impure: if the user changed sqm between
snapshots (rare), the ghost shows a value unrelated to the actual past
price/sqm.

Fix (deferred): store metadata snapshot in snapshot_items as a JSON
column, enabling correct ghost derivation. Requires DB migration; defer
until users start changing sqm frequently (likely never).

## 2026-05-12 — Broker quantity has no ghost value (deferred)

snapshot_items stores price × quantity as value_in_original_currency,
not quantity alone. Ghost for broker quantity field is therefore "0"
placeholder, not previous quantity. Acceptable for MVP; users typically
remember their position size.

Fix (deferred): derive ghost as snapshotItem.value_in_original_currency /
current_price (when current price is available). Slightly impure but
visually useful as a memory anchor.

---

## 2026-05-12 — MAJOR PIVOT: Today + Locked Snapshots data model

**This entry supersedes the original PRD §5 Episode 2/3 "review and lock" model.**
PRD §5 has been rewritten to match. This decision affects Phase 5 implementation
(partial rework) and shapes Phase 6 + Phase 7.

**Problem with original model:** PRD framed locking as "user opens app on 1st of
next month, reviews draft, locks." Reality: users don't open apps on schedule.
The "review and lock" mental model puts the burden on the user to remember to do
something on a specific day. Bad for retention.

**New model: Two distinct states.**

1. **"Today" view** — editable live state of `assets_liabilities`. No calendar
   date. User can add/edit/delete any asset any day. Live broker prices, live FX.
   Always available. The primary daily-use surface of the app.

2. **Locked monthly snapshots** — immutable point-in-time records in `snapshots`
   + `snapshot_items`. One per calendar month. `locked_at` is canonical
   first-of-month (e.g. `2026-05-01T00:00:00Z`) regardless of when in the lock
   window the user actually locked.

**Lock window:** days 1–5 of each calendar month, local time
(`today.getDate() <= 5`). Lock button visible only in this window. Days 6–31:
Today view is editable but lock is hidden; hint shows next lock window date.

**Auto-fill missed months:** if user opens app and last snapshot is more than
one month old, the app auto-creates snapshots for every fully-elapsed missed
month between then and now. Each auto-filled snapshot:
- `is_auto_filled = 1` flag in snapshots row
- Uses **current** broker/FX prices (not historical — see "current prices,
  marked auto-filled" entry below for rationale)
- Bank/Cash/Real Estate/Vehicle values = copy of previous snapshot
- Liabilities = previous snapshot principal × applyAmortization(rate, payment)
  for one cycle per month
- Visually distinct on chart (dashed line / lighter dot — Phase 7 concern)

**Edit credits:** free users get 3 global edit credits (counter in
`user_settings.edits_remaining`, starts at 3). One full edit session of any
locked snapshot = one credit. After 3, edits are a paid feature. Edit session
allows changing any/all fields and adding/deleting assets within that snapshot.
Counter is global, not per-snapshot.

**Schema changes required** (Phase 5b):
- `snapshots` adds: `is_auto_filled INTEGER DEFAULT 0`
- New table: `user_settings(key TEXT PRIMARY KEY, value TEXT)`; first row:
  `('edits_remaining', '3')`
- Migrations via `ALTER TABLE ... ADD COLUMN` guarded by existence check,
  in `initDatabase()`, idempotent.

## 2026-05-12 — Auto-fill snapshots use current prices, marked is_auto_filled

For auto-filled monthly snapshots (see pivot entry above), broker prices and
FX rates are sourced from **current** APIs at the moment of auto-fill, not
historical. This is a deliberate MVP tradeoff over fetching historical prices.

**Rationale for skipping historical:**
- Finnhub free tier does not include historical /candle data; upgrade costs
  ~$10/month.
- Binance historical klines are free but inherit the same US geo-block.
- Fawazahmed0 supports dated URLs and is free, but partial-historical (only
  FX) leaves broker prices inconsistent — not worth the asymmetry.
- Total integration cost: 1–2 dev days + ongoing subscription cost.

**What we do instead:**
- `snapshots.is_auto_filled = 1` marks the snapshot.
- Phase 7 Dashboard renders auto-filled points with a dashed line / lighter
  dot vs. user-locked points (solid line / full dot).
- Tap on auto-filled point in chart shows tooltip: "Auto-filled — prices
  from {fillDate}, not historical."
- Liability values ARE accurate (pure math from previous snapshot's principal +
  rate + payment); only broker/FX is current-not-historical.
- Bank/Cash/Real Estate/Vehicle values = frozen copy of previous snapshot
  (we have no way to know what they were on that specific day).

**Upgrade path (post-launch, paid feature):**
- "Historical Accuracy" as part of paid tier: $X/month → on retroactive view
  of auto-filled snapshots, app fetches historical prices and refines values.
- Or: at auto-fill time, batch-fetch historical FX from Fawazahmed0 (free),
  upgrade broker prices later if user pays.

This is an honest UX (user sees auto-filled markers, knows the data is
estimated) and zero new API integrations.

## 2026-05-12 — Lock window: days 1–5 inclusive, local time

The "lock window" is `today.getDate() >= 1 && today.getDate() <= 5`, evaluated
in the device's local timezone. No timezone normalization — the user's intuition
of "first of the month" is their local calendar.

- Days 1–5: Lock button visible/active. User can lock current month's snapshot.
- Days 6–end-of-month: Lock button hidden. Today view is fully editable; hint
  shows "Next lock window: {first of next month}".
- Cross-month boundary: at 00:00 local time on the 1st, lock window opens; at
  00:00 on the 6th, it closes.

Trade-offs of local-time approach:
- (+) Matches user mental model. "It's the first" means it's the first for them.
- (+) No backend, no timezone metadata to fetch or store.
- (–) A user who travels across timezones during the window can lose 1–2 days
  of access. Acceptable for MVP; revisit only if reports surface.

## 2026-05-12 — DB migration strategy: idempotent ALTER TABLE in initDatabase()

Schema migrations live inline in `src/db/schema.ts`. Pattern:
```typescript
// Existing CREATE TABLE IF NOT EXISTS for all tables
// Then, migrations (each idempotent):
await db.execAsync(`
  ALTER TABLE snapshots ADD COLUMN is_auto_filled INTEGER DEFAULT 0;
`).catch((e) => {
  // SQLite throws on duplicate column add; swallow that specific error
  if (!String(e).includes("duplicate column")) throw e;
});
```

Migrations run on every `initDatabase()` call (i.e. every app launch). Must be
idempotent (safe to run multiple times). No version table, no migration runner —
SQLite's own duplicate-column error is the idempotency mechanism.

**When to add a migration:** any schema change beyond the original Phase 2
CREATE TABLE statements. Add a new ALTER statement in chronological order at
the bottom of the migration block in `schema.ts`.

**Limitations:**
- This pattern works for ADD COLUMN, CREATE TABLE IF NOT EXISTS, CREATE INDEX
  IF NOT EXISTS. Does NOT work for DROP COLUMN, RENAME COLUMN, type changes —
  those require a versioned migration runner. If we hit one, add expo-sqlite's
  `userVersion` PRAGMA-based migration system at that time.

## 2026-05-12 — Edit credits stored in `user_settings` key-value table

A new table `user_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)` holds
single-row app-wide settings. First row seeded by initDatabase migration:
`('edits_remaining', '3')`. Value stored as TEXT for forward compatibility
(future settings may be non-integer).

**Why a generic key-value table, not a dedicated column on some other table:**
- These are app-level settings, not user-account settings (no user table).
- Future settings (haptics on/off, currency display preferences, etc.) will
  use the same table.
- Trivial migration; no schema churn when adding new settings.

**Read/write helpers** (Phase 5b implementation, src/db/settings.ts):
```typescript
getSetting(key: string): Promise<string | null>
setSetting(key: string, value: string): Promise<void>
```

Higher-level helpers wrap typed access:
```typescript
getEditsRemaining(): Promise<number>
decrementEdits(): Promise<number>  // returns new value
```

`decrementEdits` is atomic via SQL: `UPDATE user_settings SET value = CAST(value AS INTEGER) - 1 WHERE key = 'edits_remaining' AND CAST(value AS INTEGER) > 0`. Returns 0 if already at 0 (paywall trigger).

# Block to APPEND to existing DECISIONS.md

Copy-paste the entry below at the bottom of your current DECISIONS.md.
Do not edit existing entries.

---

## 2026-05-13 — Monetization model: hybrid limits + Dashboard breakdown table

Supersedes the placeholder "3 edit credits → paid" framing from the
2026-05-12 "MAJOR PIVOT" entry. Final monetization design.

**Free tier limits:**
- 3 assets maximum (any combination of types)
- 3 snapshots maximum (covers ~3 months of tracking)
- Today screen: full functionality (add/edit assets up to 3, lock snapshots up to 3, auto-fill missed months included)
- Dashboard: read-only for existing snapshots — full visualization (line chart, donut allocation, breakdown table, history list) but edit locked

**Paywall triggers (paid tier offers all of these):**
1. Attempt to add 4th asset → paywall
2. Attempt to lock 4th snapshot → paywall
3. Attempt to edit any locked snapshot → paywall
4. Attempt to export CSV/PDF → paywall

**Paid tier ($4.99/month or $29.99/year — placeholder pricing, finalize before Phase 9):**
- Unlimited assets
- Unlimited snapshots
- Edit any locked snapshot anytime (no edit credit counter — unlimited)
- Export CSV/PDF of breakdown table
- Future post-launch: historical accuracy, multiple portfolios, custom asset types

**Rationale for these limits:**
- 3 assets free lets users test with realistic minimum portfolio (bank + broker + mortgage typical)
- 3 snapshots free shows 3 points on chart = visible trend = "aha moment" before paywall
- Dashboard read-only free is the strongest free value proposition — users see full visualization of their progress, paywall only when they want to extend it or modify history
- Conversion timing: paywall hits within first few sessions for serious users (asset limit), within 3 months for casual users (snapshot limit). Not 4+ months as original "3 edit credits" design would have produced.

**Edit credits counter is REMOVED.** The `user_settings('edits_remaining', '3')` row created in Phase 5b.1 is no longer the gate. Replaced by check on `getAssetsCount() < 3` or `getSnapshotCount() < 3` at action time. The user_settings table itself stays — useful for future settings — but edits_remaining row can be removed in a migration or simply ignored.

**Phase order revision:**
- Phase 6 (Amortization tests) — unchanged
- Phase 7 (Dashboard) — expanded scope: line chart, donut, history list, **breakdown table by asset class**, delta vs previous
- Phase 9 (Paywall + IAP) — moves up BEFORE Phase 8 (Polish). Paywall infrastructure must work before public release; polish layer cosmetics can land after.
- Phase 8 (Polish) — last phase before release.

**Breakdown table specification (Phase 7):**
Tabular summary mirroring the user's existing Google Sheets workflow.
Columns: Date | Stocks | Crypto | Cash | Real Estate | Vehicles | Debt
Each row is one snapshot, sorted chronologically. Values are USD-converted
at that snapshot's exchange rates. Liabilities (Debt column) shown as
negative. "Bank" column also exists if any BANK assets — design decision
Phase 7 to combine bank + cash into one column or keep separate.

This table is exported via "Export CSV" button (paid feature). Same format
as the displayed table — users can drop directly into Google Sheets / Excel
and extend with their own columns.

**App Store / Google Play in-app purchase setup:**
- Library: RevenueCat (industry standard for cross-platform IAP, handles edge cases)
- Sandbox testing: required before release
- Restore purchases: must work (Apple review requirement)
- Subscription terms screen: required by Apple guidelines

**Pricing placeholder ($4.99/mo, $29.99/yr) finalization:**
Defer to Phase 9 start. Pricing research against competitors (Monarch, Empower,
Mint) at that time. Annual price = ~6 months equivalent = standard 50% annual
discount pattern.

## 2026-05-18 — expo-linear-gradient required by react-native-gifted-charts

gifted-charts uses gradient under area charts (transitively required even
when areaChart prop is false). Without expo-linear-gradient as a direct
dependency, app fails to bundle with "Gradient package was not found".

Installed via npx expo install expo-linear-gradient. Pinned to SDK 54
compatible version automatically.

If npm prune ever drops this — Dashboard chart will fail at runtime.
This file is where to look.

## 2026-05-18 — Paywall cap: visibility vs editability decision deferred

Phase 7b.3 implemented 3-row cap on breakdown table for free tier. In smoke
testing it became clear this blocks free users from VIEWING old snapshots,
not just editing them. Consider in Phase 9: separate cap on "visibility"
(maybe none — all snapshots visible) from cap on "edit" (paid only).

Possible refinement: keep snapshot count cap at 3 for LOCKING (user can't
create 4th snapshot), but show all existing snapshots in dashboard read-only.
This trades conversion timing (paywall hits at lock attempt, not at view)
for better free experience.

Defer final call to Phase 9 with actual paywall design.

## 2026-05-20 — Final pricing (Phase 9.1 research complete)

Competitor research (May 2026):
- Monarch: $14.99/mo, $99.99/yr (cross-platform, bank-linked)
- YNAB: $14.99/mo, $109/yr (cross-platform, zero-based budgeting)
- Copilot: $13/mo, $95/yr (Apple-only)
- Tiller: $79/yr (sheets-based)
- SheetLink: $4.99/mo, $39.99/yr (sheets-based, closest niche competitor)

NetWorth is NOT competing on features with bank-linked apps. It's a manual,
privacy-first, no-bank-linking tracker. Closest competitors are sheets-based
tools (Tiller, SheetLink) at $40-80/yr.

FINAL PRICING:
- Monthly: $4.99 (accessible, matches SheetLink monthly, well below premium tier)
- Annual: $29.99 ($2.50/mo equivalent, 50% discount vs monthly×12)
- Trial: NONE. Free tier (3 assets, 3 snapshots, read-only Dashboard) serves
  as the trial — user evaluates free forever, upgrades at limit.

Rationale for $29.99 annual (cheapest on market):
- Unproven brand, no track record yet — low barrier accelerates first 100 users
- Manual entry = higher friction = lower price compensates
- Can raise later: Apple/Google grandfather existing subscribers at old price,
  new subscribers see new price. Lowering needs no consent; raising prompts
  existing users.
- First-100-users goal prioritizes adoption velocity over revenue per user

Revisit pricing after 100 paying users with real conversion data.

Product IDs (App Store Connect + Google Play):
- com.bmpcorpo.networth.premium_monthly
- com.bmpcorpo.networth.premium_annual
RevenueCat entitlement: "premium"
RevenueCat offering: "default" with $rc_monthly + $rc_annual packages

## 2026-05-21 — Tab navigation + Settings screen (Phase 7d)

Restructured navigation from a flat native-stack into a bottom-tab navigator
nested inside the RootStack:

  RootStack (native-stack, headers hidden)
  ├─ Tabs            ← bottom-tab navigator (Today / Dashboard / Settings)
  ├─ Grid            ← pushed above the tabs ("+ Add" / first-run onboarding)
  ├─ SnapshotDetail  ← pushed above the tabs
  └─ Paywall         ← modal above the tabs

Rationale: keeping Grid/SnapshotDetail/Paywall in the RootStack (not as tabs)
means pushing them covers the tab bar automatically — no `tabBarStyle:
{ display: "none" }` toggling per-route. Tab screens are typed with
CompositeScreenProps<BottomTabScreenProps, NativeStackScreenProps<Root>> so they
navigate to both sibling tabs and root screens type-safely.

Onboarding/initial route: replaced Stack `initialRouteName` with
NavigationContainer `initialState`. First run (no assets) seeds a back stack of
[Tabs(Today), Grid] — the user lands on Grid and `goBack()` drops them into the
tabs once they add an asset. With assets present, opens Dashboard (if any
snapshot exists) or Today. This is why GridScreen's footer changed from
navigate("Today") to goBack() — Grid is now always a pushed screen.

Settings is reached via a TAB, not the gear-on-Dashboard originally sketched in
PROGRESS 9.6. The Dashboard header "Today" link + gear placeholder were removed
(redundant with the tab bar).

### Dependencies pinned as direct deps (do not rely on transitive resolution)
- @react-navigation/bottom-tabs ^7.16.1 — tab navigator (hard requirement)
- @expo/vector-icons ^15.1.1 — tab bar + Settings row icons. Pinned explicitly:
  it was NOT previously in node_modules, and nested resolution breaks when Expo
  restructures node_modules across SDK bumps.
- expo-constants ~18.0.13 — read app version/build in Settings (cleaner than
  require("../../app.json")). Same pinning rationale.
All installed via `npx expo install` (SDK-54-compatible versions).

### Placeholders (resolve at ASO stage)
- Support email: support@bmpcorpo.com — CONFIRM monitored before release.
- Legal URLs: bmpcorpo.com/networth/{privacy,terms} — same as PaywallScreen.

### Incidental fix
- app.json had an invalid `"expo-sqlite"11` in `plugins` (stray edit) that broke
  JSON parsing; restored to `"expo-sqlite"`.

## 2026-05-22 — react-native-purchases NOT in app.json plugins (Expo autolinking only)

**NEVER add react-native-purchases or react-native-purchases-ui to the `plugins`
array in app.json.** RC v10 uses Expo autolinking and has no Expo config plugin.
Adding either package to `plugins` causes a PluginError at build time.

This was tried, broke the build, and reverted in commit d922192 ("Fix: remove
react-native-purchases from plugins (uses autolinking)").

**Correct setup:**
- Install via `npx expo install react-native-purchases react-native-purchases-ui`
- Do NOT touch app.json plugins — autolinking handles native module wiring automatically

Verified end-to-end: sandbox annual subscription purchased (commit f53c8f3 diagnostic
logs), RevenueCat entitlement "premium" activated, isPaid=true confirmed in app —
all without any plugin entry.

If any future session or on-device assistant suggests adding RC to app.json plugins,
this entry overrides that advice. The purchase flow is confirmed working without it.

## 2026-05-25 — Phase 9 sandbox purchase verified end-to-end

Annual subscription (com.bmpcorpo.networth.premium_annual, $29.99) purchased via
Apple sandbox, RevenueCat entitlement "premium" activated, isPaid=true confirmed
via [entitlement] diagnostic logs. Full flow: tap "Subscribe Annual" → StoreKit
sandbox sheet → purchase → RC listener fires → entitlementStore.isPaid = true →
breakdown table unlocks, paywall triggers bypass.

**Still outstanding before App Store submission:**
- Restore purchases: code exists (Purchases.restorePurchases in PaywallScreen +
  SettingsScreen), but uninstall→reinstall→restore flow has NOT been tested on device
- Android purchase flow: Google Play sandbox not yet set up
- Subscription expiration / renewal: not tested

None of these block further development; all required before submission.
