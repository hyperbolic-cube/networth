import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart, PieChart } from "react-native-gifted-charts";
import type { LineSegment, lineDataItem } from "react-native-gifted-charts";
import { Body, Caption, Display } from "../components/Typography";
import { SectionHeader } from "../components/SectionHeader";
import { getAllAssets } from "../db/assets";
import { getAllSnapshots } from "../db/snapshots";
import { useClockStore } from "../store/clockStore";
import type { AssetLiability, Snapshot } from "../types";
import type { RootStackParamList } from "../types/navigation";
import {
  ASSET_CLASSES,
  aggregateByClass,
  aggregateSnapshotByClass,
  type AssetClass,
  type ClassTotals,
} from "../utils/assetClass";
import { formatHeroMoney, monthDayYearLabel } from "../utils/format";
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
  // The true net-worth dollars. For the all-negative branch we shift `value`
  // into positive space to dodge a gifted-charts negative-axis bug (see below);
  // `originalValue` preserves the unshifted dollars for the tooltip.
  originalValue: number;
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

  // gifted-charts' negative-axis code path is broken: it gates the negative
  // branch of getY() on `stepValue !== negativeStepValue`, and otherwise falls
  // through to the positive formula which divides by maxValue=0. Net effect:
  // dots render millions of pixels offscreen. Workaround: when all data is
  // negative, shift every value by `yOffset` so the chart renders as
  // positive-only (the well-tested code path), and subtract `yOffset` back in
  // formatYLabel so the axis still reads as negative dollars. The mixed-sign
  // branch happens to work natively and is left untouched.
  let yAxisProps: {
    maxValue: number;
    mostNegativeValue?: number;
    noOfSections: number;
    stepValue: number;
    noOfSectionsBelowXAxis?: number;
  };
  let yOffset = 0;
  if (minVal >= 0) {
    const top = maxVal + pad;
    yAxisProps = { maxValue: top, noOfSections: 4, stepValue: top / 4 };
  } else if (maxVal <= 0) {
    const bottom = minVal - pad;
    yOffset = Math.abs(bottom);
    const top = maxVal + pad + yOffset;
    yAxisProps = { maxValue: top, noOfSections: 4, stepValue: top / 4 };
  } else {
    // Mixed sign. Intentionally omit negativeStepValue: when it equals
    // stepValue (the default), gifted-charts routes negative values through
    // its positive-axis formula extended past zero, which happens to render
    // correctly across an x-axis. Supplying an explicit negativeStepValue
    // (even the "right" one) trips the broken negative branch of getY().
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
    };
  }

  const data: EnrichedDataItem[] = snapshots.map((s) => ({
    value: s.total_net_worth_usd + yOffset,
    originalValue: s.total_net_worth_usd,
    label: monthShortLabel(s.locked_at),
    dataPointColor: s.is_auto_filled ? ACCENT_FADED : ACCENT,
    dataPointRadius: s.is_auto_filled ? 3 : 5,
    snapshotId: s.id,
    isAutoFilled: s.is_auto_filled,
    lockedAt: s.locked_at,
  }));

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
          formatYLabel={(label) =>
            abbreviateUsd(String(Number(label) - yOffset))
          }
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
                    {formatTooltipMoney(item.originalValue)}
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

// ── Donut allocation (Phase 7b.2) ──────────────────────────────────────────

const CLASS_COLORS: Record<AssetClass, string> = {
  Stocks: "#0A84FF",
  Crypto: "#5E5CE6",
  Cash: "#30D158",
  RealEstate: "#FF9F0A",
  Vehicles: "#BF5AF2",
  Debt: "#FF453A",
};

const CLASS_LABELS: Record<AssetClass, string> = {
  Stocks: "Stocks",
  Crypto: "Crypto",
  Cash: "Cash",
  RealEstate: "Real Estate",
  Vehicles: "Vehicles",
  Debt: "Debt",
};

const DONUT_RADIUS = 90;
const DONUT_INNER_RADIUS = 54; // 60% of outer
const NEAR_ZERO_USD = 0.01;
const WIDE_LAYOUT_BREAKPOINT = 380;

/** Format a USD amount for legend rows / debt bar (no cents, signed). */
function formatLegendMoney(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n < 0 ? "−" + formatted : formatted;
}

type LegendRow = {
  cls: AssetClass;
  usd: number;
  share: number; // 0..1 relative to total positive assets
};

function DonutCenter({ totalAssets }: { totalAssets: number }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text
        style={{
          color: TEXT_SECONDARY,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Assets
      </Text>
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 18,
          fontWeight: "700",
          marginTop: 4,
        }}
      >
        {formatLegendMoney(totalAssets)}
      </Text>
    </View>
  );
}

function LegendRowView({ row }: { row: LegendRow }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          backgroundColor: CLASS_COLORS[row.cls],
          marginRight: 10,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
          {CLASS_LABELS[row.cls]}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
          {formatLegendMoney(row.usd)}
        </Text>
        <Text
          style={{
            color: TEXT_SECONDARY,
            fontSize: 11,
            fontWeight: "600",
            marginTop: 2,
          }}
        >
          {(row.share * 100).toFixed(0)}%
        </Text>
      </View>
    </View>
  );
}

function DonutSection() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mockDate = useClockStore((s) => s.mockDate);
  const [totals, setTotals] = useState<ClassTotals | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTotals(null);
    getAllAssets()
      .then(async (assets) => {
        const t = await aggregateByClass(assets);
        if (!cancelled) setTotals(t);
      })
      .catch((err) => {
        console.error("[DonutSection] aggregateByClass failed:", err);
        if (!cancelled) {
          setTotals({
            Stocks: 0,
            Crypto: 0,
            Cash: 0,
            RealEstate: 0,
            Vehicles: 0,
            Debt: 0,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mockDate]);

  if (totals === null) {
    return (
      <View style={{ paddingBottom: 32 }}>
        <SectionHeader title="Allocation" />
        <View
          style={{
            marginHorizontal: HORIZONTAL_PADDING,
            height: 192,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={TEXT_SECONDARY} />
        </View>
      </View>
    );
  }

  const debtUsd = totals.Debt; // already negative or 0

  const assetRows: LegendRow[] = ASSET_CLASSES
    .filter((c) => c !== "Debt" && totals[c] > NEAR_ZERO_USD)
    .map((c) => ({ cls: c, usd: totals[c], share: 0 }));

  const totalAssets = assetRows.reduce((sum, r) => sum + r.usd, 0);
  assetRows.forEach((r) => {
    r.share = totalAssets > 0 ? r.usd / totalAssets : 0;
  });
  assetRows.sort((a, b) => b.usd - a.usd);

  const hasDebt = debtUsd < -NEAR_ZERO_USD;
  const isWide = SCREEN_WIDTH >= WIDE_LAYOUT_BREAKPOINT;

  // Empty state: no positive assets at all.
  if (assetRows.length === 0) {
    return (
      <View style={{ paddingBottom: 32 }}>
        <SectionHeader title="Allocation" />
        <View
          style={{
            marginHorizontal: HORIZONTAL_PADDING,
            paddingVertical: 32,
            alignItems: "center",
            gap: 16,
          }}
        >
          <Body className="text-textSecondary text-center">
            Add assets to see your allocation.
          </Body>
          <Pressable
            onPress={() => {
              tapLight();
              navigation.navigate("Grid");
            }}
            style={{
              backgroundColor: ACCENT,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>
              Go to Grid
            </Text>
          </Pressable>
        </View>
        {hasDebt && (
          <View style={{ paddingHorizontal: HORIZONTAL_PADDING, marginTop: 8 }}>
            <DebtBar usd={debtUsd} />
          </View>
        )}
      </View>
    );
  }

  const pieData = assetRows.map((r) => ({
    value: r.usd,
    color: CLASS_COLORS[r.cls],
  }));

  const donut = (
    <PieChart
      data={pieData}
      donut
      radius={DONUT_RADIUS}
      innerRadius={DONUT_INNER_RADIUS}
      innerCircleColor={"#000000"}
      isAnimated
      animationDuration={600}
      centerLabelComponent={() => <DonutCenter totalAssets={totalAssets} />}
    />
  );

  const legend = (
    <View>
      {assetRows.map((r) => (
        <LegendRowView key={r.cls} row={r} />
      ))}
    </View>
  );

  return (
    <View style={{ paddingBottom: 32 }}>
      <SectionHeader title="Allocation" />

      {isWide ? (
        <View
          style={{
            paddingHorizontal: HORIZONTAL_PADDING,
            flexDirection: "row",
            alignItems: "center",
            gap: 24,
          }}
        >
          <View>{donut}</View>
          <View style={{ flex: 1 }}>{legend}</View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: HORIZONTAL_PADDING, alignItems: "center" }}>
          {donut}
          <View style={{ width: "100%", marginTop: 24 }}>{legend}</View>
        </View>
      )}

      {hasDebt && (
        <View style={{ paddingHorizontal: HORIZONTAL_PADDING, marginTop: 16 }}>
          <DebtBar usd={debtUsd} />
        </View>
      )}
    </View>
  );
}

function DebtBar({ usd }: { usd: number }) {
  return (
    <View
      style={{
        backgroundColor: "#FF453A4D", // 30% alpha
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 24,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
        Debt
      </Text>
      <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
        {formatLegendMoney(usd)}
      </Text>
    </View>
  );
}

// ── Breakdown table by month (Phase 7b.3) ─────────────────────────────────

// Visible rows in free tier. Phase 9 will swap the cap check for a paid-state
// guard; the trim semantics (most-recent N) stay the same.
const BREAKDOWN_FREE_LIMIT = 3;

const DATE_COL_WIDTH = 88;
const VALUE_COL_WIDTH = 84;
const TABLE_ROW_HEIGHT = 48;
const TABLE_HEADER_HEIGHT = 36;
const TABLE_CELL_PADDING_H = 12;

// Order of class columns in the table — matches the user's Google Sheets
// columns and the order in DECISIONS.md 2026-05-13.
const TABLE_CLASS_ORDER: readonly AssetClass[] = [
  "Stocks",
  "Crypto",
  "Cash",
  "RealEstate",
  "Vehicles",
  "Debt",
] as const;

const SHORT_CLASS_LABEL: Record<AssetClass, string> = {
  Stocks: "Stocks",
  Crypto: "Crypto",
  Cash: "Cash",
  RealEstate: "Real Est.",
  Vehicles: "Vehicles",
  Debt: "Debt",
};

/** Compact USD: $450, $12k, $1.2M, $10M. Negative renders with leading `−`. */
function formatCompactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs < 1) return "$0";
  if (abs < 1_000) return `${sign}$${Math.round(abs)}`;
  if (abs < 1_000_000) {
    return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }
  return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
}

/** "May '26" — short month + apostrophe + 2-digit year. Apostrophe disambiguates
 * year-of-decade from day-of-month (so "Mar '26" doesn't read as "March 26th").
 * Timezone-safe like monthShortLabel. */
function monthShortYearLabel(lockedAt: string): string {
  const [year, month] = lockedAt.split("T")[0].split("-").map(Number);
  const monthShort = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
  const yy = String(year).slice(-2);
  return `${monthShort} '${yy}`;
}

type BreakdownRow = { snapshot: Snapshot; totals: ClassTotals };

function BreakdownHeaderRow() {
  return (
    <View
      style={{
        height: TABLE_HEADER_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: SURFACE_ELEVATED,
      }}
    >
      {TABLE_CLASS_ORDER.map((cls) => (
        <View
          key={cls}
          style={{
            width: VALUE_COL_WIDTH,
            paddingHorizontal: TABLE_CELL_PADDING_H,
            alignItems: "flex-end",
          }}
        >
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
            numberOfLines={1}
          >
            {SHORT_CLASS_LABEL[cls]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BreakdownDateCell({ row }: { row: BreakdownRow }) {
  const isAuto = row.snapshot.is_auto_filled === 1;
  const color = isAuto ? TEXT_SECONDARY : "#FFFFFF";
  const label = monthShortYearLabel(row.snapshot.locked_at);
  return (
    <View
      style={{
        width: DATE_COL_WIDTH,
        paddingHorizontal: TABLE_CELL_PADDING_H,
        justifyContent: "center",
      }}
    >
      <Text style={{ color, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
        {isAuto ? `··· ${label}` : label}
      </Text>
    </View>
  );
}

function BreakdownValueCells({ row }: { row: BreakdownRow }) {
  const isAuto = row.snapshot.is_auto_filled === 1;
  return (
    <View style={{ flexDirection: "row" }}>
      {TABLE_CLASS_ORDER.map((cls) => {
        const v = row.totals[cls];
        // Empty cells (no value of this class in this snapshot) render as an
        // em dash instead of "$0" — "$0" implies "you had cash and it was zero"
        // which is a false signal.
        const isEmpty = Math.abs(v) < 0.005;
        let color: string;
        if (isEmpty) color = TEXT_SECONDARY;
        else if (cls === "Debt") color = NEGATIVE;
        else color = isAuto ? TEXT_SECONDARY : "#FFFFFF";
        return (
          <View
            key={cls}
            style={{
              width: VALUE_COL_WIDTH,
              paddingHorizontal: TABLE_CELL_PADDING_H,
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <Text
              style={{ color, fontSize: 13, fontWeight: "500" }}
              numberOfLines={1}
            >
              {isEmpty ? "—" : formatCompactMoney(v)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function BreakdownBodyRow({
  row,
  isLast,
  onPress,
}: {
  row: BreakdownRow;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        height: TABLE_ROW_HEIGHT,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: SURFACE_ELEVATED,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <BreakdownValueCells row={row} />
    </Pressable>
  );
}

function UpgradeRow({ totalSnapshots }: { totalSnapshots: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      onPress={() => {
        tapLight();
        navigation.navigate("Paywall", { reason: "snapshot_limit" });
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: TABLE_ROW_HEIGHT,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SURFACE_ELEVATED,
        opacity: pressed ? 0.55 : 1,
        paddingHorizontal: TABLE_CELL_PADDING_H,
      })}
    >
      <Text style={{ color: ACCENT, fontSize: 13, fontWeight: "600" }}>
        Upgrade to see all {totalSnapshots} snapshots →
      </Text>
    </Pressable>
  );
}

function BreakdownDateHeaderCell() {
  return (
    <View
      style={{
        height: TABLE_HEADER_HEIGHT,
        width: DATE_COL_WIDTH,
        paddingHorizontal: TABLE_CELL_PADDING_H,
        justifyContent: "center",
        borderBottomWidth: 1,
        borderBottomColor: SURFACE_ELEVATED,
      }}
    >
      <Text
        style={{
          color: TEXT_SECONDARY,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
        numberOfLines={1}
      >
        Date
      </Text>
    </View>
  );
}

function BreakdownDateRow({
  row,
  isLast,
  onPress,
}: {
  row: BreakdownRow;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        height: TABLE_ROW_HEIGHT,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: SURFACE_ELEVATED,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <BreakdownDateCell row={row} />
    </Pressable>
  );
}

function BreakdownTableSection({ snapshots }: { snapshots: Snapshot[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mockDate = useClockStore((s) => s.mockDate);
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const assets: AssetLiability[] = await getAllAssets();
        const assetsById = new Map(assets.map((a) => [a.id, a]));
        const totals = await Promise.all(
          snapshots.map((s) => aggregateSnapshotByClass(s.id, assetsById))
        );
        if (!cancelled) {
          setRows(snapshots.map((snapshot, i) => ({ snapshot, totals: totals[i] })));
        }
      } catch (err) {
        console.error("[BreakdownTableSection] load failed:", err);
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshots, mockDate]);

  if (rows === null) {
    return (
      <View style={{ paddingBottom: 32 }}>
        <SectionHeader title="Breakdown by month" />
        <View
          style={{
            marginHorizontal: HORIZONTAL_PADDING,
            height: 160,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={TEXT_SECONDARY} />
        </View>
      </View>
    );
  }

  const isCapped = rows.length > BREAKDOWN_FREE_LIMIT;
  // Oldest-first ordering. When capped we still show the most recent N
  // (free tier must show recent data — paywall gates history, not the present).
  // The upgrade prompt sits at the TOP, where the older hidden rows would be.
  const visibleRows = isCapped ? rows.slice(-BREAKDOWN_FREE_LIMIT) : rows;

  return (
    <View style={{ paddingBottom: 32 }}>
      <SectionHeader title="Breakdown by month" />
      <View
        style={{
          marginHorizontal: HORIZONTAL_PADDING,
          borderRadius: 16,
          backgroundColor: SURFACE,
          overflow: "hidden",
        }}
      >
        {/* Upgrade prompt spans the full table width — outside the row
            container so sticky+scrollable halves stay symmetric. */}
        {isCapped && <UpgradeRow totalSnapshots={rows.length} />}

        <View style={{ flexDirection: "row" }}>
          {/* Sticky left column: Date header + per-row date cells. Mirrors
              the right side's row count and heights exactly. */}
          <View>
            <BreakdownDateHeaderCell />
            {visibleRows.map((row, i) => (
              <BreakdownDateRow
                key={row.snapshot.id}
                row={row}
                isLast={i === visibleRows.length - 1}
                onPress={() => {
                  tapLight();
                  navigation.navigate("SnapshotDetail", { snapshotId: row.snapshot.id });
                }}
              />
            ))}
          </View>

          {/* Scrollable right pane: class header + value cells */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            <View>
              <BreakdownHeaderRow />
              {visibleRows.map((row, i) => (
                <BreakdownBodyRow
                  key={row.snapshot.id}
                  row={row}
                  isLast={i === visibleRows.length - 1}
                  onPress={() => {
                    tapLight();
                    navigation.navigate("SnapshotDetail", { snapshotId: row.snapshot.id });
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </View>
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
          <DonutSection />
          <BreakdownTableSection snapshots={snapshots} />
        </ScrollView>
      )}
    </View>
  );
}
