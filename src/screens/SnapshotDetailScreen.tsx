import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SectionHeader } from "../components/SectionHeader";
import { getAllAssets } from "../db/assets";
import { getSnapshotById, getSnapshotItems } from "../db/snapshots";
import type { AssetLiability, Snapshot, SnapshotItem } from "../types";
import type { SnapshotDetailScreenProps } from "../types/navigation";
import {
  ASSET_CLASSES,
  classifyAsset,
  type AssetClass,
} from "../utils/assetClass";
import { formatHeroMoney, monthDayYearLabel, monthYearLabel } from "../utils/format";
import { tapLight } from "../utils/haptics";
import { useIsPaid } from "../utils/entitlement";

// ── Theme ──────────────────────────────────────────────────────────────────

const ACCENT = "#0A84FF";
const NEGATIVE = "#FF453A";
const TEXT_SECONDARY = "#8E8E93";
const SURFACE = "#1C1C1E";
const SURFACE_ELEVATED = "#2C2C2E";
const HORIZONTAL_PADDING = 24;

// ── Item grouping ──────────────────────────────────────────────────────────

type DetailItem = {
  id: string;
  name: string;
  isDeleted: boolean;
  calculatedUsd: number;
  originalAmount: number;
  originalCurrency: string; // "" = suppress subtitle (USD or deleted asset)
};

type ClassGroup = {
  cls: AssetClass;
  items: DetailItem[];
  subtotal: number;
};

function buildClassGroups(
  items: SnapshotItem[],
  assetsById: Map<string, AssetLiability>,
): ClassGroup[] {
  const buckets = new Map<AssetClass, DetailItem[]>();

  for (const item of items) {
    const asset = assetsById.get(item.asset_liability_id);
    let cls: AssetClass;
    let name: string;
    let isDeleted: boolean;
    let originalCurrency: string;

    if (asset) {
      cls = classifyAsset(asset);
      name = asset.name;
      isDeleted = false;
      // Brokers store price×qty in USD as value_in_original_currency —
      // the subtitle would be redundant, so suppress it for any USD asset.
      originalCurrency = asset.currency === "USD" ? "" : asset.currency;
    } else {
      // Asset was deleted after this snapshot was locked. Sign-based fallback
      // matches the policy in aggregateSnapshotByClass.
      cls = item.calculated_value_usd < 0 ? "Debt" : "Cash";
      name = "(Deleted asset)";
      isDeleted = true;
      originalCurrency = ""; // currency unknown — suppress subtitle
    }

    const d: DetailItem = {
      id: item.id,
      name,
      isDeleted,
      calculatedUsd: item.calculated_value_usd,
      originalAmount: item.value_in_original_currency,
      originalCurrency,
    };

    const bucket = buckets.get(cls) ?? [];
    bucket.push(d);
    buckets.set(cls, bucket);
  }

  return ASSET_CLASSES.filter((cls) => buckets.has(cls)).map((cls) => {
    const clsItems = buckets.get(cls)!;
    return {
      cls,
      items: clsItems,
      subtotal: clsItems.reduce((s, i) => s + i.calculatedUsd, 0),
    };
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

const CLASS_LABELS: Record<AssetClass, string> = {
  Stocks: "Stocks",
  Crypto: "Crypto",
  Cash: "Cash",
  RealEstate: "Real Estate",
  Vehicles: "Vehicles",
  Debt: "Debt",
};

function SnapshotHero({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const netWorth = snapshot.total_net_worth_usd;
  const heroColor = netWorth < 0 ? NEGATIVE : "#FFFFFF";

  return (
    <View
      style={{
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingBottom: 24,
        paddingTop: 8,
      }}
    >
      <Text
        style={{
          color: TEXT_SECONDARY,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Net Worth
      </Text>
      <Text
        style={{
          color: heroColor,
          fontSize: 40,
          fontWeight: "700",
          letterSpacing: -0.5,
          marginTop: 6,
        }}
      >
        {formatHeroMoney(netWorth)}
      </Text>
      <Text style={{ color: TEXT_SECONDARY, fontSize: 13, marginTop: 6 }}>
        Locked {monthDayYearLabel(snapshot.locked_at)}
      </Text>
    </View>
  );
}

function ItemRow({
  item,
  isLast,
  isDebt,
}: {
  item: DetailItem;
  isLast: boolean;
  isDebt: boolean;
}) {
  const valueColor = isDebt ? NEGATIVE : "#FFFFFF";
  const nameStyle = item.isDeleted
    ? { color: TEXT_SECONDARY, fontSize: 15, fontStyle: "italic" as const }
    : { color: "#FFFFFF", fontSize: 15, fontWeight: "500" as const };

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          paddingHorizontal: 16,
          paddingVertical: 10,
        },
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: SURFACE_ELEVATED,
        },
      ]}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={nameStyle} numberOfLines={1}>
          {item.name}
        </Text>
        {item.originalCurrency !== "" && (
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 12,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {item.originalAmount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            {item.originalCurrency}
          </Text>
        )}
      </View>
      <Text style={{ color: valueColor, fontSize: 15, fontWeight: "600" }}>
        {formatHeroMoney(item.calculatedUsd)}
      </Text>
    </View>
  );
}

function ClassGroupSection({ group }: { group: ClassGroup }) {
  const isDebt = group.cls === "Debt";
  const subtotalColor = isDebt ? NEGATIVE : "#FFFFFF";

  return (
    <View style={{ paddingBottom: 24 }}>
      <SectionHeader title={CLASS_LABELS[group.cls]} />
      <View
        style={{
          marginHorizontal: HORIZONTAL_PADDING,
          borderRadius: 12,
          backgroundColor: SURFACE,
          overflow: "hidden",
        }}
      >
        {group.items.map((item, i) => (
          <ItemRow
            key={item.id}
            item={item}
            isLast={i === group.items.length - 1}
            isDebt={isDebt}
          />
        ))}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: SURFACE_ELEVATED,
          }}
        >
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 13,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Total
          </Text>
          <Text
            style={{ color: subtotalColor, fontSize: 13, fontWeight: "700" }}
          >
            {formatHeroMoney(group.subtotal)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

type ScreenState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; snapshot: Snapshot; groups: ClassGroup[] };

export function SnapshotDetailScreen({
  route,
  navigation,
}: SnapshotDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { snapshotId } = route.params;
  const isPaid = useIsPaid();
  const [state, setState] = useState<ScreenState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const [snapshot, items, assets] = await Promise.all([
          getSnapshotById(snapshotId),
          getSnapshotItems(snapshotId),
          getAllAssets(),
        ]);

        if (!snapshot) {
          if (!cancelled) setState({ status: "error" });
          return;
        }

        const assetsById = new Map(assets.map((a) => [a.id, a]));
        const groups = buildClassGroups(items, assetsById);

        if (!cancelled) setState({ status: "ready", snapshot, groups });
      } catch (err) {
        console.error("[SnapshotDetailScreen] load failed:", err);
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  const title =
    state.status === "ready"
      ? monthYearLabel(state.snapshot.locked_at)
      : "";

  const isAutoFilled =
    state.status === "ready" && state.snapshot.is_auto_filled === 1;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => {
            tapLight();
            navigation.goBack();
          }}
          hitSlop={12}
          style={{ minWidth: 80 }}
        >
          <Text style={{ color: ACCENT, fontSize: 16, fontWeight: "500" }}>
            ‹ Dashboard
          </Text>
        </Pressable>

        <View style={{ flex: 1, alignItems: "center" }}>
          {state.status === "ready" && (
            <>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 17,
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
              {isAutoFilled && (
                <View
                  style={{
                    marginTop: 4,
                    backgroundColor: ACCENT + "33",
                    borderRadius: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      color: ACCENT,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    Auto-filled
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <Pressable
          onPress={() => {
            tapLight();
            if (!isPaid) {
              navigation.navigate("Paywall", { reason: "edit_locked" });
            } else {
              Alert.alert("Coming soon", "Snapshot editing is coming in a future update.");
            }
          }}
          hitSlop={12}
          style={{ minWidth: 80, alignItems: "flex-end" }}
        >
          <Text style={{ color: ACCENT, fontSize: 16, fontWeight: "500" }}>
            Edit
          </Text>
        </Pressable>
      </View>

      {/* Body */}
      {state.status === "loading" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={TEXT_SECONDARY} />
        </View>
      )}

      {state.status === "error" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: HORIZONTAL_PADDING,
          }}
        >
          <Text
            style={{ color: TEXT_SECONDARY, fontSize: 15, textAlign: "center" }}
          >
            Snapshot not found.
          </Text>
        </View>
      )}

      {state.status === "ready" && (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          <SnapshotHero snapshot={state.snapshot} />
          {state.groups.map((group) => (
            <ClassGroupSection key={group.cls} group={group} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
