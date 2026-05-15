import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getLatestAutoFilledSnapshot,
  getLatestSnapshot,
  getSnapshotByMonth,
  getSnapshotCount,
  getSnapshotItems,
  lockSnapshot,
} from "../db/snapshots";
import { useAssetsStore } from "../store/assetsStore";
import { useClockStore } from "../store/clockStore";
import type {
  AssetLiability,
  BrokerMetadata,
  LiabilityMetadata,
  RealEstateMetadata,
  SimpleValueMetadata,
  Snapshot,
} from "../types";
import type { ComputedItem } from "../types";
import { EditValueSheet } from "../components/EditValueSheet";
import { Body, Caption, Display } from "../components/Typography";
import { tapLight, tapMedium, notifySuccess } from "../utils/haptics";
import { computeItem, type RowStatus } from "../utils/computeItems";
import { getNow } from "../utils/clock";
import {
  getCurrentMonthSnapshotDate,
  getCurrentYearMonth,
  daysUntilNextLockWindow,
  isInLockWindow,
  nextLockWindowDate,
} from "../utils/lockWindow";
import { applyAmortization } from "../utils/amortization";
import type { RootStackParamList } from "../types/navigation";

// ── Constants ──────────────────────────────────────────────────────────────

const LIABILITY_TYPES = new Set(["MORTGAGE", "CREDIT_DEBT", "AUTO_LOAN"]);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format a number as a dollar amount with up to 2 decimal places. */
function formatMoney(n: number): string {
  return "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Sort: assets first (preserve created_at order), liabilities last. */
function sortItems(items: AssetLiability[]): AssetLiability[] {
  const assets = items.filter((i) => !LIABILITY_TYPES.has(i.type));
  const liabilities = items.filter((i) => LIABILITY_TYPES.has(i.type));
  return [...assets, ...liabilities];
}

type HintVariant = "locked" | "missed" | "first_time" | "outside_window" | "none";

function getHintVariant(
  inWindow: boolean,
  hasMonthSnapshot: boolean,
  hasAnySnapshot: boolean,
  latestAutoFilled: Snapshot | null,
): HintVariant {
  if (inWindow && !hasMonthSnapshot) return "none";       // lock button shown
  if (hasMonthSnapshot) return "locked";                  // A: already locked
  if (!hasAnySnapshot) return "first_time";               // C: never locked
  if (latestAutoFilled !== null) return "missed";         // B: auto-fill exists
  return "outside_window";                                // pre-5b.4 transitional
}

/** Extract month name from a locked_at ISO string without UTC→local date shift. */
function monthNameFromLockedAt(lockedAt: string): string {
  // locked_at is always "YYYY-MM-01T..." — parse components from the string
  // directly so negative-UTC-offset timezones don't roll back to the prior month.
  const [year, month] = lockedAt.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long" });
}

// ── Edit target ─────────────────────────────────────────────────────────────

type EditField =
  | "amount"
  | "price_per_sqm"
  | "quantity"
  | "principal"
  | "manual_price";

interface EditTarget {
  item: AssetLiability;
  field: EditField;
}

const FIELD_LABELS: Record<EditField, string> = {
  amount: "Amount",
  price_per_sqm: "Price per m²",
  quantity: "Quantity",
  principal: "Current principal",
  manual_price: "Current price per unit",
};

// ── Row state ───────────────────────────────────────────────────────────────

type RowEntry = { computed: ComputedItem; status: RowStatus };

// ── TodayScreen ────────────────────────────────────────────────────────────

export function TodayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const items = useAssetsStore((s) => s.items);
  const mockDate = useClockStore((s) => s.mockDate);
  const sorted = sortItems(items);

  // ── Row state keyed by item.id ─────────────────────────────────────────
  const [rowMap, setRowMap] = useState<Record<string, RowEntry>>({});

  useEffect(() => {
    let cancelled = false;

    // Seed all rows to loading first.
    setRowMap((prev) => {
      const next: Record<string, RowEntry> = {};
      for (const item of items) {
        next[item.id] = prev[item.id] ?? {
          computed: {
            ...item,
            computed_value_usd: 0,
            value_in_original_currency: 0,
            exchange_rate_to_usd: 0,
          },
          status: "loading",
        };
      }
      return next;
    });

    Promise.allSettled(
      items.map(async (item) => {
        const result = await computeItem(item);
        if (cancelled) return;
        setRowMap((prev) => ({ ...prev, [item.id]: result }));
      })
    );

    return () => {
      cancelled = true;
    };
  }, [items]);

  // ── Snapshot state — re-runs when mock date changes ───────────────────
  const [snapshotExistsForMonth, setSnapshotExistsForMonth] = useState(false);
  const [hasAnySnapshot, setHasAnySnapshot] = useState(false);
  const [latestAutoFilledSnapshot, setLatestAutoFilledSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const yearMonth = getCurrentYearMonth(); // reads getNow() → mock-aware
    Promise.all([
      getSnapshotByMonth(yearMonth),
      getSnapshotCount(),
      getLatestAutoFilledSnapshot(),
    ]).then(([monthSnap, count, autoFilled]) => {
      if (cancelled) return;
      setSnapshotExistsForMonth(monthSnap !== null);
      setHasAnySnapshot(count > 0);
      setLatestAutoFilledSnapshot(autoFilled);
    });
    return () => { cancelled = true; };
  }, [mockDate]); // re-runs on every mock date change

  // ── Lock state ─────────────────────────────────────────────────────────
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState(false);

  // ── Edit sheet ─────────────────────────────────────────────────────────
  const editSheetRef = useRef<BottomSheetModal>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  function getInitialValue(target: EditTarget): string {
    const { item, field } = target;
    if (field === "manual_price") return "";
    if (field === "amount") {
      return String((item.metadata as SimpleValueMetadata).amount ?? "");
    }
    if (field === "price_per_sqm") {
      return String((item.metadata as RealEstateMetadata).price_per_sqm ?? "");
    }
    if (field === "quantity") {
      return String((item.metadata as BrokerMetadata).quantity ?? "");
    }
    if (field === "principal") {
      return String((item.metadata as LiabilityMetadata).principal ?? "");
    }
    return "";
  }

  function handleRowPress(item: AssetLiability) {
    tapLight();
    let field: EditField;
    const rowEntry = rowMap[item.id];
    const isUnavailable =
      rowEntry?.status === "unavailable_not_found" ||
      rowEntry?.status === "unavailable_offline";

    switch (item.type) {
      case "BANK":
      case "CASH":
      case "VEHICLE":
        field = "amount";
        break;
      case "REAL_ESTATE":
        field = "price_per_sqm";
        break;
      case "BROKER":
        field = isUnavailable ? "manual_price" : "quantity";
        break;
      case "MORTGAGE":
      case "CREDIT_DEBT":
      case "AUTO_LOAN":
        field = "principal";
        break;
      default:
        field = "amount";
    }

    const target: EditTarget = { item, field };
    setEditTarget(target);
    // Present after state update — use setTimeout to ensure state is set.
    setTimeout(() => editSheetRef.current?.present(), 0);
  }

  function handleSave(value: number) {
    if (!editTarget) return;
    const { item, field } = editTarget;
    const store = useAssetsStore.getState();

    if (field === "manual_price") {
      // Ephemeral override — do not persist.
      const meta = item.metadata as BrokerMetadata;
      const total = value * meta.quantity;
      setRowMap((prev) => ({
        ...prev,
        [item.id]: {
          computed: {
            ...item,
            computed_value_usd: total,
            value_in_original_currency: total,
            exchange_rate_to_usd: 1,
          },
          status: "override",
        },
      }));
      return;
    }

    if (field === "amount") {
      store.update(item.id, { metadata: { amount: value } });
      return;
    }

    if (field === "price_per_sqm") {
      const meta = item.metadata as RealEstateMetadata;
      store.update(item.id, {
        metadata: { sqm: meta.sqm, price_per_sqm: value },
      });
      return;
    }

    if (field === "quantity") {
      const meta = item.metadata as BrokerMetadata;
      store.update(item.id, {
        metadata: {
          instrumentType: meta.instrumentType,
          ticker: meta.ticker,
          quantity: value,
        },
      });
      return;
    }

    if (field === "principal") {
      const meta = item.metadata as LiabilityMetadata;
      store.update(item.id, {
        metadata: {
          principal: value,
          interest_rate: meta.interest_rate,
          monthly_payment: meta.monthly_payment,
        },
      });
    }
  }

  // ── Footer totals ──────────────────────────────────────────────────────
  let assetsTotal = 0;
  let liabilitiesAbs = 0;
  for (const item of sorted) {
    const entry = rowMap[item.id];
    if (!entry) continue;
    const v = entry.computed.computed_value_usd;
    if (v > 0) assetsTotal += v;
    else if (v < 0) liabilitiesAbs += Math.abs(v);
  }
  const netWorth = assetsTotal - liabilitiesAbs;

  // ── Lock window (re-evaluates on every render triggered by state change) ─
  const rowValues = Object.values(rowMap);
  const rowsReady = rowValues.length === items.length;
  const anyLoading = rowValues.some((r) => r.status === "loading");
  const anyUnavailable = rowValues.some(
    (r) => r.status === "unavailable_not_found" || r.status === "unavailable_offline"
  );
  const lockDisabled =
    items.length === 0 || !rowsReady || anyLoading || anyUnavailable || locking;

  const inLockWindow = isInLockWindow();         // reads getNow() → mock-aware
  const lockMonthName = getNow().toLocaleDateString(undefined, { month: "long" });
  const hintVariant = getHintVariant(
    inLockWindow,
    snapshotExistsForMonth,
    hasAnySnapshot,
    latestAutoFilledSnapshot,
  );

  // ── Lock action ────────────────────────────────────────────────────────
  async function handleLock() {
    if (lockDisabled) return;
    setLocking(true);
    setLockError(false);
    try {
      const lockItems = sorted.map((item) => {
        const entry = rowMap[item.id];
        return {
          asset_liability_id: item.id,
          value_in_original_currency: entry.computed.value_in_original_currency,
          exchange_rate_to_usd: entry.computed.exchange_rate_to_usd,
          calculated_value_usd: entry.computed.computed_value_usd,
        };
      });

      await lockSnapshot({
        items: lockItems,
        lockedAt: getCurrentMonthSnapshotDate(),
        isAutoFilled: 0,
      });

      // Apply amortization to liabilities — continue on per-item failure so
      // a single bad update doesn't leave siblings unamortized.
      const store = useAssetsStore.getState();
      for (const item of sorted) {
        if (!LIABILITY_TYPES.has(item.type)) continue;
        const meta = item.metadata as LiabilityMetadata;
        try {
          const newPrincipal = applyAmortization(
            meta.principal,
            meta.interest_rate,
            meta.monthly_payment,
          );
          await store.update(item.id, {
            metadata: {
              principal: newPrincipal,
              interest_rate: meta.interest_rate,
              monthly_payment: meta.monthly_payment,
            },
          });
        } catch (err) {
          if (__DEV__) console.warn(`[lock] amortization update failed for ${item.id}:`, err);
        }
      }

      tapMedium();
      notifySuccess();
      setSnapshotExistsForMonth(true);
      setHasAnySnapshot(true);

      if (__DEV__) {
        const snapshot = await getLatestSnapshot();
        const snapItems = snapshot ? await getSnapshotItems(snapshot.id) : [];
        console.log("[Snapshot locked]", JSON.stringify({ snapshot, items: snapItems }, null, 2));
      }
    } catch (err) {
      console.error("[TodayScreen] lockSnapshot failed:", err);
      setLockError(true);
    } finally {
      setLocking(false);
    }
  }

  // ── Row renderer ───────────────────────────────────────────────────────

  const FOOTER_HEIGHT = 210;

  function renderRow({ item }: { item: AssetLiability }) {
    const entry = rowMap[item.id];
    const status: RowStatus = entry?.status ?? "loading";
    const computed = entry?.computed;
    const isLiability = LIABILITY_TYPES.has(item.type);

    return (
      <Pressable
        onPress={() => handleRowPress(item)}
        className="bg-surface rounded-xl px-4 py-3 flex-row items-center justify-between"
      >
        {/* Left: name */}
        <Body className="flex-1 mr-3" numberOfLines={1}>
          {item.name}
        </Body>

        {/* Right: value / status */}
        <View className="items-end">
          {status === "loading" && (
            <ActivityIndicator color="#8E8E93" />
          )}

          {(status === "fresh" || status === "override") && computed && (
            <Body className="font-semibold">
              {isLiability && computed.computed_value_usd < 0
                ? `−${formatMoney(computed.computed_value_usd)}`
                : formatMoney(computed.computed_value_usd)}
            </Body>
          )}

          {status === "stale" && computed && (
            <>
              <Body className="font-semibold">
                {isLiability && computed.computed_value_usd < 0
                  ? `−${formatMoney(computed.computed_value_usd)}`
                  : formatMoney(computed.computed_value_usd)}
              </Body>
              <Caption>Last known price</Caption>
            </>
          )}

          {(status === "unavailable_not_found" ||
            status === "unavailable_offline") && (
            <>
              <Caption className="text-negative">Price unavailable</Caption>
              <Caption className="text-textSecondary">Tap to enter manually</Caption>
            </>
          )}
        </View>

        {/* Chevron */}
        <Text style={{ color: "#8E8E93", fontSize: 18, marginLeft: 8 }}>›</Text>
      </Pressable>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Mock date banner (DEV only, when active) ───────────────────── */}
      {__DEV__ && mockDate !== null && (
        <View
          style={{ paddingTop: insets.top, backgroundColor: "#0A84FF" }}
          className="items-center py-1.5"
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12 }}>
            🕐 Mock date: {mockDate.toDateString()}
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={{ paddingTop: __DEV__ && mockDate !== null ? 12 : insets.top + 12 }}
        className="px-6 pb-4 flex-row items-center gap-x-4"
      >
        <Pressable
          onPress={() => {
            tapLight();
            navigation.navigate("Grid");
          }}
          hitSlop={12}
        >
          <Body className="text-accent">+ Add</Body>
        </Pressable>
        <Display className="flex-1">Today</Display>
      </View>

      {/* Row list */}
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: FOOTER_HEIGHT + insets.bottom + 16,
          gap: 8,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky footer */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: insets.bottom + 16,
          backgroundColor: "#1C1C1E",
          paddingHorizontal: 24,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: "#2C2C2E",
        }}
      >
        {/* Totals */}
        <View className="flex-row justify-between mb-1">
          <Caption>Assets</Caption>
          <Caption className="text-textPrimary font-semibold">
            {formatMoney(assetsTotal)}
          </Caption>
        </View>
        <View className="flex-row justify-between mb-1">
          <Caption>Liabilities</Caption>
          <Caption className="text-textPrimary font-semibold">
            {formatMoney(liabilitiesAbs)}
          </Caption>
        </View>
        <View className="flex-row justify-between">
          <Body className="font-semibold">Net Worth</Body>
          <Body
            className={`font-bold ${
              netWorth < 0 ? "text-negative" : "text-positive"
            }`}
          >
            {netWorth < 0
              ? `−${formatMoney(netWorth)}`
              : formatMoney(netWorth)}
          </Body>
        </View>

        {/* Lock button or contextual hint */}
        {hintVariant === "none" ? (
          <>
            {lockError && (
              <View style={{ marginTop: 12, alignItems: "center" }}>
                <Caption className="text-negative">Couldn't save — try again</Caption>
              </View>
            )}
            <Pressable
              onPress={lockDisabled ? undefined : handleLock}
              style={{
                marginTop: 12,
                backgroundColor: lockDisabled ? "#1C1C1E" : "#0A84FF",
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: "center",
                opacity: lockDisabled ? 0.4 : 1,
                borderWidth: lockDisabled ? 1 : 0,
                borderColor: "#2C2C2E",
              }}
            >
              {locking ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
                  Lock {lockMonthName} Snapshot
                </Text>
              )}
            </Pressable>
          </>
        ) : hintVariant === "locked" ? (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <Caption className="text-textPrimary font-semibold">
              <Text className="text-positive">✓ </Text>
              {lockMonthName} snapshot locked
            </Caption>
            <Caption className="text-textSecondary" style={{ marginTop: 2 }}>
              Next lock window: {nextLockWindowDate()}
            </Caption>
          </View>
        ) : hintVariant === "missed" ? (
          <Pressable
            onPress={() => {
              tapLight();
              Alert.alert("Coming soon", "Snapshot editing will be available in the next update.");
            }}
            style={{ marginTop: 12, alignItems: "center" }}
          >
            <Caption className="text-textPrimary">
              {monthNameFromLockedAt(latestAutoFilledSnapshot!.locked_at)} snapshot needs your review
            </Caption>
            <Caption className="text-textSecondary" style={{ marginTop: 2 }}>
              We auto-filled it — tap to verify
            </Caption>
          </Pressable>
        ) : hintVariant === "first_time" ? (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <Caption className="text-textPrimary">
              Snapshots track your monthly progress
            </Caption>
            <Caption className="text-textSecondary" style={{ marginTop: 2 }}>
              Your first lock window: {nextLockWindowDate()} ({daysUntilNextLockWindow()} days)
            </Caption>
          </View>
        ) : (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <Caption className="text-textSecondary">
              Next lock window: {nextLockWindowDate()}
            </Caption>
          </View>
        )}
      </View>

      {/* Edit value sheet — mounted once, reused for every row */}
      <EditValueSheet
        ref={editSheetRef}
        title={editTarget?.item.name ?? "Edit"}
        fieldLabel={editTarget ? FIELD_LABELS[editTarget.field] : ""}
        initialValue={editTarget ? getInitialValue(editTarget) : ""}
        onSave={handleSave}
      />
    </View>
  );
}
