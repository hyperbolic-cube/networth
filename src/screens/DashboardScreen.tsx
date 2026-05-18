import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart } from "react-native-gifted-charts";
import type { LineSegment, lineDataItem } from "react-native-gifted-charts";
import { Body, Caption, Display } from "../components/Typography";
import { getAllSnapshots } from "../db/snapshots";
import { useClockStore } from "../store/clockStore";
import type { Snapshot } from "../types";
import type { RootStackParamList } from "../types/navigation";
import { tapLight } from "../utils/haptics";

// ── Theme constants ───────────────────────────────────────────────────────

const ACCENT = "#0A84FF";
const ACCENT_FADED = "#0A84FF80"; // 50% alpha — auto-filled dots
const POSITIVE = "#30D158";
const NEGATIVE = "#FF453A";
const TEXT_SECONDARY = "#8E8E93";
const SURFACE = "#1C1C1E";
const SURFACE_ELEVATED = "#2C2C2E";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
// Below this device width, Y-axis labels are hidden to give the chart more room.
// Covers iPhone SE 1/2/3 (320/375pt).
const HIDE_Y_LABELS_BELOW = 380;

// ── Formatting helpers ─────────────────────────────────────────────────────

/** Whole-dollar format with thousand separators. Negative renders as `−$1,234`. */
function formatHeroMoney(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n < 0 ? "−" + formatted : formatted;
}

/** Signed delta: `+$1,234` / `−$1,234` / `$0`. */
function formatDelta(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n > 0) return "+" + formatted;
  if (n < 0) return "−" + formatted;
  return formatted;
}

/** Signed percent: `+2.3%` / `−2.3%` / `0.0%`. */
function formatPct(pct: number): string {
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0) return `+${abs}%`;
  if (pct < 0) return `−${abs}%`;
  return `${abs}%`;
}

/** Tooltip dollar format — keeps cents for sub-$1k values, rounds above. */
function formatTooltipMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) {
    return (n < 0 ? "−" : "") + "$" + abs.toFixed(2);
  }
  return formatHeroMoney(n);
}

/** Short month name from "YYYY-MM-01T...". Parses string components directly to
 * avoid the UTC→local rollback that bites negative-UTC-offset timezones. */
function monthShortLabel(lockedAt: string): string {
  const [year, month] = lockedAt.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

/** Long date label like "May 1, 2026", timezone-safe (see monthShortLabel). */
function monthDayYearLabel(lockedAt: string): string {
  const [year, month, day] = lockedAt.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Compact USD for y-axis labels: 1.2k, 50k, 1.2M. */
function abbreviateUsd(label: string): string {
  const n = Number(label);
  if (!Number.isFinite(n)) return label;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

// ── Section header (Apple Health style) ───────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 12 }}>
      <Text
        style={{
          color: TEXT_SECONDARY,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
    </View>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

function Hero({ current, previous }: { current: Snapshot; previous: Snapshot | null }) {
  // The hero number stays white even when delta is negative — only the delta
  // pill turns red. We only paint the hero number red when net worth itself is
  // actually negative (net debt). Mirrors iOS Stocks.
  const heroColor = current.total_net_worth_usd < 0 ? NEGATIVE : "#FFFFFF";

  const deltaAbs = previous
    ? current.total_net_worth_usd - previous.total_net_worth_usd
    : null;

  // Use abs(previous) in the denominator so a swing from -1000 → +500 shows as
  // a positive percent (intuitive direction), not a sign-flipped negative.
  const deltaPct =
    previous && previous.total_net_worth_usd !== 0
      ? ((current.total_net_worth_usd - previous.total_net_worth_usd) /
          Math.abs(previous.total_net_worth_usd)) *
        100
      : null;

  const deltaColor =
    deltaAbs === null
      ? TEXT_SECONDARY
      : deltaAbs > 0
        ? POSITIVE
        : deltaAbs < 0
          ? NEGATIVE
          : TEXT_SECONDARY;

  return (
    <View style={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 32 }}>
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
          fontSize: 56,
          fontWeight: "700",
          letterSpacing: -1,
          marginTop: 8,
        }}
      >
        {formatHeroMoney(current.total_net_worth_usd)}
      </Text>

      {deltaAbs === null ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <Text style={{ color: TEXT_SECONDARY, fontSize: 15, fontWeight: "600" }}>
            —
          </Text>
          <Text style={{ color: TEXT_SECONDARY, fontSize: 13, marginLeft: 8 }}>
            First snapshot
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          <Text style={{ color: deltaColor, fontSize: 15, fontWeight: "600" }}>
            {formatDelta(deltaAbs)}
          </Text>
          {deltaPct !== null && (
            <Text style={{ color: deltaColor, fontSize: 13, marginLeft: 6 }}>
              ({formatPct(deltaPct)})
            </Text>
          )}
          {previous && (
            <Text style={{ color: "#FFFFFF", fontSize: 13, marginLeft: 8 }}>
              vs {monthShortLabel(previous.locked_at)}
            </Text>
          )}
        </View>
      )}

      <Text style={{ color: TEXT_SECONDARY, fontSize: 13, marginTop: 6 }}>
        As of {monthDayYearLabel(current.locked_at)}
      </Text>
    </View>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────────

type EnrichedDataItem = lineDataItem & {
  snapshotId: string;
  isAutoFilled: 0 | 1;
  lockedAt: string;
};

function ChartSection({ snapshots }: { snapshots: Snapshot[] }) {
  const hideYLabels = SCREEN_WIDTH < HIDE_Y_LABELS_BELOW;
  const yAxisLabelWidth = hideYLabels ? 0 : 44;
  const chartWidth = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
  const initialSpacing = 16;
  const endSpacing = 16;
  const availableForSpacing =
    chartWidth - yAxisLabelWidth - initialSpacing - endSpacing;
  const spacing =
    snapshots.length > 1
      ? Math.max(40, Math.floor(availableForSpacing / (snapshots.length - 1)))
      : 40;

  const data: EnrichedDataItem[] = snapshots.map((s) => ({
    value: s.total_net_worth_usd,
    label: monthShortLabel(s.locked_at),
    dataPointColor: s.is_auto_filled ? ACCENT_FADED : ACCENT,
    dataPointRadius: s.is_auto_filled ? 3 : 5,
    snapshotId: s.id,
    isAutoFilled: s.is_auto_filled,
    lockedAt: s.locked_at,
  }));

  // A segment is dashed iff either endpoint is auto-filled.
  const lineSegments: LineSegment[] = [];
  for (let i = 0; i < snapshots.length - 1; i++) {
    if (snapshots[i].is_auto_filled || snapshots[i + 1].is_auto_filled) {
      lineSegments.push({
        startIndex: i,
        endIndex: i + 1,
        color: ACCENT,
        thickness: 2,
        strokeDashArray: [4, 4],
      });
    }
  }

  const values = snapshots.map((s) => s.total_net_worth_usd);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const dataRange = maxVal - minVal || Math.abs(maxVal) || 1;
  const pad = dataRange * 0.15;

  const hasAutoFilled = snapshots.some((s) => s.is_auto_filled === 1);

  // gifted-charts is anchored at y=0 and computes stepValue from
  // maxValue/noOfSections. If we leave maxValue at 0 (or auto) when data is
  // all-negative, stepValue divides to 0 and the lib falls back to a default
  // step (~2.5), producing axis labels like $0/$3/$5/$8/$10 with no visible
  // line. Branch on data sign and pass an explicit stepValue per side.
  let yAxisProps: {
    maxValue: number;
    mostNegativeValue?: number;
    noOfSections: number;
    stepValue: number;
    noOfSectionsBelowXAxis?: number;
    stepValueNegative?: number;
  };
  if (minVal >= 0) {
    const top = maxVal + pad;
    yAxisProps = { maxValue: top, noOfSections: 4, stepValue: top / 4 };
  } else if (maxVal <= 0) {
    const bottom = minVal - pad;
    const step = Math.abs(bottom) / 4;
    yAxisProps = {
      maxValue: 0,
      mostNegativeValue: bottom,
      noOfSections: 1,
      stepValue: step,
      noOfSectionsBelowXAxis: 4,
      stepValueNegative: step,
    };
  } else {
    const top = maxVal + pad;
    const bottom = minVal - pad;
    const total = top + Math.abs(bottom);
    const step = total / 5;
    const posSections = Math.max(1, Math.round(top / step));
    const negSections = Math.max(1, 5 - posSections);
    yAxisProps = {
      maxValue: top,
      mostNegativeValue: bottom,
      noOfSections: posSections,
      stepValue: top / posSections,
      noOfSectionsBelowXAxis: negSections,
      stepValueNegative: Math.abs(bottom) / negSections,
    };
  }

  return (
    <View style={{ paddingBottom: 32 }}>
      <SectionHeader title="Net worth over time" />
      <View style={{ paddingHorizontal: HORIZONTAL_PADDING - 16 }}>
        <LineChart
          data={data}
          width={chartWidth}
          height={220}
          color={ACCENT}
          thickness={2}
          curved={false}
          initialSpacing={initialSpacing}
          endSpacing={endSpacing}
          spacing={spacing}
          lineSegments={lineSegments}
          rulesColor={SURFACE}
          rulesType="solid"
          rulesThickness={1}
          xAxisColor={SURFACE}
          yAxisColor="transparent"
          yAxisThickness={0}
          hideYAxisText={hideYLabels}
          yAxisLabelWidth={yAxisLabelWidth}
          yAxisTextStyle={{ color: TEXT_SECONDARY, fontSize: 11 }}
          xAxisLabelTextStyle={{ color: TEXT_SECONDARY, fontSize: 11 }}
          formatYLabel={abbreviateUsd}
          disableScroll
          isAnimated
          animationDuration={600}
          {...yAxisProps}
          pointerConfig={{
            pointerColor: ACCENT,
            radius: 6,
            pointerStripColor: SURFACE_ELEVATED,
            pointerStripWidth: 1,
            pointerStripUptoDataPoint: true,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: EnrichedDataItem[]) => {
              const item = items?.[0];
              if (!item) return null;
              return (
                <View
                  style={{
                    backgroundColor: SURFACE,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: SURFACE_ELEVATED,
                    minWidth: 120,
                  }}
                >
                  <Text style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                    {monthDayYearLabel(item.lockedAt)}
                    {item.isAutoFilled === 1 ? " · auto" : ""}
                  </Text>
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 15,
                      fontWeight: "600",
                      marginTop: 2,
                    }}
                  >
                    {formatTooltipMoney(item.value ?? 0)}
                  </Text>
                </View>
              );
            },
          }}
        />
      </View>

      {hasAutoFilled && (
        <Caption
          className="text-textSecondary"
          style={{ paddingHorizontal: HORIZONTAL_PADDING, marginTop: 12 }}
        >
          · · ·  Auto-filled months use current prices
        </Caption>
      )}
    </View>
  );
}

// ── Placeholder block for sections shipping in 7b.2 / 7b.3 ────────────────

function UpcomingPlaceholder({
  title,
  label,
  height,
}: {
  title: string;
  label: string;
  height: number;
}) {
  return (
    <View style={{ paddingBottom: 24 }}>
      <SectionHeader title={title} />
      <View
        style={{
          marginHorizontal: HORIZONTAL_PADDING,
          height,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: SURFACE_ELEVATED,
          borderStyle: "dashed",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Caption className="text-textSecondary">{label}</Caption>
      </View>
    </View>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingVertical: 80,
        gap: 16,
      }}
    >
      <Body className="text-textSecondary text-center">
        Lock your first snapshot to see your wealth trend.
      </Body>
      <Pressable
        onPress={() => {
          tapLight();
          navigation.navigate("Today");
        }}
        style={{
          backgroundColor: ACCENT,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 32,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>
          Go to Today
        </Text>
      </Pressable>
    </View>
  );
}

// ── DashboardScreen ────────────────────────────────────────────────────────

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const mockDate = useClockStore((s) => s.mockDate);

  // null = loading, [] = empty, length >= 1 = render
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshots(null);
    getAllSnapshots()
      .then((rows) => {
        if (!cancelled) setSnapshots(rows);
      })
      .catch((err) => {
        console.error("[DashboardScreen] getAllSnapshots failed:", err);
        if (!cancelled) setSnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mockDate]);

  const current =
    snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const previous =
    snapshots && snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;

  return (
    <View className="flex-1 bg-background">
      {__DEV__ && mockDate !== null && (
        <View
          style={{ paddingTop: insets.top, backgroundColor: ACCENT }}
          className="items-center py-1.5"
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12 }}>
            🕐 Mock date: {mockDate.toDateString()}
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={{
          paddingTop: __DEV__ && mockDate !== null ? 12 : insets.top + 12,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 24,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Display>Dashboard</Display>
        <Pressable
          onPress={() => {
            tapLight();
            navigation.navigate("Today");
          }}
          hitSlop={12}
        >
          <Body className="text-accent">Today</Body>
        </Pressable>
        {/* Gear icon placeholder — added in Phase 9 Settings */}
      </View>

      {snapshots === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={TEXT_SECONDARY} />
        </View>
      ) : snapshots.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Hero current={current!} previous={previous} />
          <ChartSection snapshots={snapshots} />
          <UpcomingPlaceholder
            title="Allocation"
            label="Donut chart — Phase 7b.2"
            height={192}
          />
          <UpcomingPlaceholder
            title="Breakdown by month"
            label="Breakdown table — Phase 7b.3"
            height={128}
          />
        </ScrollView>
      )}
    </View>
  );
}
