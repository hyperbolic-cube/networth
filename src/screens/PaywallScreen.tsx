import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Purchases, { PACKAGE_TYPE } from "react-native-purchases";
import type { PurchasesPackage } from "react-native-purchases";
import { useEntitlementStore } from "../store/entitlementStore";
import { useIsPaid, type PaywallReason } from "../utils/entitlement";
import { tapLight } from "../utils/haptics";
import type { PaywallScreenProps } from "../types/navigation";

// ── Theme ──────────────────────────────────────────────────────────────────

const BG = "#000000";
const SURFACE = "#1C1C1E";
const ACCENT = "#0A84FF";
const POSITIVE = "#30D158";
const NEGATIVE = "#FF453A";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#8E8E93";
const FINE_PRINT = "#636366";
const BORDER = "#3A3A3C";

const TERMS_URL = "https://bmpcorpo.com/networth/terms";
const PRIVACY_URL = "https://bmpcorpo.com/networth/privacy";

// ── Context-aware copy ───────────────────────────────────────────────────────

const HEADLINES: Record<PaywallReason, string> = {
  asset_limit: "Track everything you own",
  snapshot_limit: "Your full history, every month",
  edit_locked: "Fix any month, any time",
  export: "Take your data anywhere",
};

const SUBHEADLINES: Record<PaywallReason, string> = {
  asset_limit:
    "You've started something real. Go unlimited to capture your full financial picture — every account, property, and position.",
  snapshot_limit:
    "Three months showed you the trend. Unlimited months will show you the journey.",
  edit_locked:
    "No locked-in mistakes. Edit historical figures whenever your records need updating.",
  export:
    "Download your full breakdown as CSV and drop it straight into Google Sheets, Excel, or anywhere you already work.",
};

const BENEFITS: { icon: string; text: string; reason: PaywallReason }[] = [
  { icon: "📊", text: "Unlimited assets — track every account, property, and position", reason: "asset_limit" },
  { icon: "📅", text: "Unlimited monthly snapshots — your complete wealth timeline", reason: "snapshot_limit" },
  { icon: "✏️", text: "Edit any locked snapshot — correct the past when records change", reason: "edit_locked" },
  { icon: "📤", text: "Export to CSV — import directly into Google Sheets or Excel", reason: "export" },
  { icon: "⭐", text: "All future features — subscribers always get new tools first", reason: "asset_limit" },
];

// ── Pricing card ─────────────────────────────────────────────────────────────

type Pkg = PurchasesPackage | null;

function PricingCard({
  plan,
  selected,
  onPress,
  priceLabel,
  subLabel,
  savingsBadge,
}: {
  plan: "annual" | "monthly";
  selected: boolean;
  onPress: () => void;
  priceLabel: string;
  subLabel?: string;
  savingsBadge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? ACCENT : BORDER,
        backgroundColor: selected ? "rgba(10,132,255,0.1)" : SURFACE,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Text style={{ color: TEXT_PRIMARY, fontSize: 15, fontWeight: "600" }}>
          {plan === "annual" ? "Annual" : "Monthly"}
        </Text>
        {subLabel ? (
          <Text style={{ color: TEXT_SECONDARY, fontSize: 13, marginTop: 2 }}>
            {subLabel}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: "flex-end" }}>
        {savingsBadge ? (
          <View
            style={{
              backgroundColor: POSITIVE,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              marginBottom: 4,
            }}
          >
            <Text style={{ color: "#000000", fontSize: 11, fontWeight: "700" }}>
              {savingsBadge}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: TEXT_PRIMARY, fontSize: 17, fontWeight: "700" }}>
          {priceLabel}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function PaywallScreen({ route, navigation }: PaywallScreenProps) {
  const { reason } = route.params;
  const insets = useSafeAreaInsets();

  const [annualPkg, setAnnualPkg] = useState<Pkg>(null);
  const [monthlyPkg, setMonthlyPkg] = useState<Pkg>(null);
  const [selected, setSelected] = useState<"annual" | "monthly">("annual");
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Fetch offerings on mount ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const pkgs = offerings.current?.availablePackages ?? [];
        const annual = pkgs.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null;
        const monthly = pkgs.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ?? null;
        if (!annual && !monthly) {
          setDevMode(true);
        } else {
          setAnnualPkg(annual);
          setMonthlyPkg(monthly);
        }
      } catch {
        setDevMode(true);
      }
    })();
  }, []);

  // ── Auto-dismiss when entitlement flips on ─────────────────────────────
  const isPaid = useIsPaid();
  useEffect(() => {
    if (isPaid) navigation.goBack();
  }, [isPaid]);

  // ── Handlers ───────────────────────────────────────────────────────────
  async function handlePurchase() {
    const pkg = selected === "annual" ? annualPkg : monthlyPkg;
    if (!pkg || devMode) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await Purchases.purchasePackage(pkg);
      // success: listener fires → store updates → isPaid useEffect dismisses
    } catch (err) {
      const rcErr = err as { userCancelled?: boolean };
      if (!rcErr.userCancelled) {
        setErrorMsg("Couldn't complete purchase. Try again.");
      }
      // silent on cancel
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    if (devMode) return;
    setRestoring(true);
    setErrorMsg(null);
    try {
      const info = await Purchases.restorePurchases();
      useEntitlementStore.getState()._setFromCustomerInfo(info);
      const hasPremium = "premium" in info.entitlements.active;
      if (!hasPremium) {
        setErrorMsg("No previous purchases found.");
      }
      // if hasPremium: store update fires isPaid → true → useEffect dismisses
    } catch {
      setErrorMsg("Restore failed. Check your connection and try again.");
    } finally {
      setRestoring(false);
    }
  }

  // ── Pricing derivation ─────────────────────────────────────────────────
  const annualPriceStr = annualPkg?.product.priceString ?? "$29.99";
  const monthlyPriceStr = monthlyPkg?.product.priceString ?? "$4.99";
  const annualMonthlyEq = annualPkg
    ? "$" + (annualPkg.product.price / 12).toFixed(2) + "/mo"
    : "$2.50/mo";
  const savingsPct =
    annualPkg && monthlyPkg
      ? Math.round((1 - annualPkg.product.price / (monthlyPkg.product.price * 12)) * 100)
      : 50;

  // ── Highlighted benefit ────────────────────────────────────────────────
  const highlightIndex = BENEFITS.findIndex((b) => b.reason === reason);
  const accentIndex = highlightIndex >= 0 ? highlightIndex : 0;

  const ctaDisabled = devMode || loading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* DEV banner */}
      {__DEV__ && devMode && (
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>
            DEV — Purchases unavailable (no RC keys)
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            tapLight();
            navigation.goBack();
          }}
          hitSlop={12}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.headline}>{HEADLINES[reason]}</Text>
          <Text style={styles.subheadline}>{SUBHEADLINES[reason]}</Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text
                style={[
                  styles.benefitIcon,
                  { color: i === accentIndex ? ACCENT : TEXT_SECONDARY },
                ]}
              >
                {b.icon}
              </Text>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* Pricing cards */}
        <View style={styles.pricing}>
          <PricingCard
            plan="annual"
            selected={selected === "annual"}
            onPress={() => {
              tapLight();
              setSelected("annual");
            }}
            priceLabel={annualPriceStr + " / year"}
            subLabel={annualMonthlyEq}
            savingsBadge={`Save ${savingsPct}%`}
          />
          <PricingCard
            plan="monthly"
            selected={selected === "monthly"}
            onPress={() => {
              tapLight();
              setSelected("monthly");
            }}
            priceLabel={monthlyPriceStr + " / month"}
          />
        </View>

        {/* CTA */}
        <Pressable
          onPress={ctaDisabled ? undefined : handlePurchase}
          style={{
            marginHorizontal: 20,
            paddingVertical: 18,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: ctaDisabled ? "#3A3A3C" : ACCENT,
            opacity: ctaDisabled ? 0.5 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color={TEXT_PRIMARY} />
          ) : (
            <Text style={styles.ctaText}>
              {devMode ? "Purchases unavailable in dev build" : "Subscribe"}
            </Text>
          )}
        </Pressable>

        {/* Error */}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* Restore */}
        <Pressable
          onPress={devMode ? undefined : handleRestore}
          style={styles.restore}
          hitSlop={8}
        >
          <Text
            style={[
              styles.restoreText,
              { color: devMode ? FINE_PRINT : TEXT_SECONDARY },
            ]}
          >
            {restoring ? "Restoring…" : "Restore purchases"}
          </Text>
        </Pressable>

        {/* Legal links */}
        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <Text style={styles.legalLink}> · </Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
        </View>

        {/* Fine print */}
        <Text style={styles.finePrint}>
          Cancel anytime. Billed through App Store or Google Play.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  devBanner: {
    backgroundColor: "#FF9F0A",
    paddingVertical: 4,
    alignItems: "center",
  },
  devBannerText: {
    color: "#000000",
    fontSize: 11,
    fontWeight: "600",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  closeIcon: {
    color: TEXT_SECONDARY,
    fontSize: 22,
    fontWeight: "500",
  },
  hero: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 28,
  },
  headline: {
    color: TEXT_PRIMARY,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subheadline: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    marginTop: 12,
    lineHeight: 21,
  },
  benefits: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 14,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  benefitIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 26,
  },
  benefitText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    flex: 1,
    lineHeight: 21,
  },
  pricing: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 28,
  },
  ctaText: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "700",
  },
  errorText: {
    color: NEGATIVE,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 24,
  },
  restore: {
    paddingVertical: 8,
    marginTop: 8,
    alignItems: "center",
  },
  restoreText: {
    fontSize: 13,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  legalLink: {
    color: FINE_PRINT,
    fontSize: 11,
  },
  finePrint: {
    color: FINE_PRINT,
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
});
