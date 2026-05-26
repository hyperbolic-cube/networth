import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import Purchases from "react-native-purchases";
import { useEntitlementStore } from "../store/entitlementStore";
import { useIsPaid } from "../utils/entitlement";
import { Body, Caption, Display } from "../components/Typography";
import { SectionHeader } from "../components/SectionHeader";
import { tapLight } from "../utils/haptics";
import type { SettingsScreenProps } from "../types/navigation";

// ── Theme ──────────────────────────────────────────────────────────────────

const ACCENT = "#0A84FF";
const POSITIVE = "#30D158";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#8E8E93";
const SURFACE = "#1C1C1E";
const SURFACE_ELEVATED = "#2C2C2E";
const HORIZONTAL_PADDING = 24;

// ── Constants ────────────────────────────────────────────────────────────────
// Support address + legal URLs are placeholders pending ASO (DECISIONS.md
// 2026-05-21). Confirm support@bmpcorpo.com is monitored before release.

const SUPPORT_EMAIL = "support@bmpcorpo.com";
const TERMS_URL = "https://bmpcorpo.com/networth/terms";
const PRIVACY_URL = "https://bmpcorpo.com/networth/privacy";
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://apps.apple.com/account/subscriptions",
}) as string;

// ── Helpers ────────────────────────────────────────────────────────────────

async function openUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open link", url);
  }
}

/** "1.0.0 (12)" — version from app config, build from the native binary. */
function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? "—";
  const build = Constants.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}

// ── Row primitives ───────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  detail,
  onPress,
  busy,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress?: () => void;
  busy?: boolean;
  isLast?: boolean;
}) {
  const interactive = onPress !== undefined;
  return (
    <Pressable
      onPress={interactive ? onPress : undefined}
      disabled={!interactive || busy}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        minHeight: 52,
        paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: SURFACE_ELEVATED,
        opacity: pressed && interactive ? 0.55 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={TEXT_SECONDARY} style={{ marginRight: 14 }} />
      <Text style={{ color: TEXT_PRIMARY, fontSize: 16, flex: 1 }}>{label}</Text>
      {busy ? (
        <ActivityIndicator color={TEXT_SECONDARY} />
      ) : detail ? (
        <Text style={{ color: TEXT_SECONDARY, fontSize: 15 }}>{detail}</Text>
      ) : interactive ? (
        <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
      ) : null}
    </Pressable>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: HORIZONTAL_PADDING,
        marginBottom: 24,
        borderRadius: 14,
        backgroundColor: SURFACE,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const isPaid = useIsPaid();
  const [restoring, setRestoring] = useState(false);
  const customerInfo = useEntitlementStore((s) => s.customerInfo);
  const devPaidOverride = useEntitlementStore((s) => s.devPaidOverride);

  const isDevOverride = __DEV__ && devPaidOverride === true && isPaid;
  const subscriptionLabel = (() => {
    if (!isPaid) return "Free plan";
    if (isDevOverride) return "Premium (dev override)";
    const productId = customerInfo?.entitlements.active["premium"]?.productIdentifier ?? "";
    if (productId.includes("annual")) return "Premium — Annual";
    if (productId.includes("monthly")) return "Premium — Monthly";
    return "Premium";
  })();
  const starColor = isPaid ? (isDevOverride ? "#FFD60A" : POSITIVE) : TEXT_SECONDARY;

  async function handleRestore() {
    tapLight();
    setRestoring(true);
    try {
      if (!(await Purchases.isConfigured())) {
        Alert.alert("Unavailable", "Purchases aren't configured in this build.");
        return;
      }
      const info = await Purchases.restorePurchases();
      useEntitlementStore.getState()._setFromCustomerInfo(info);
      const hasPremium = "premium" in info.entitlements.active;
      Alert.alert(
        hasPremium ? "Purchases restored" : "Nothing to restore",
        hasPremium
          ? "Your Premium access is active."
          : "We couldn't find a previous purchase on this account.",
      );
    } catch {
      Alert.alert("Restore failed", "Check your connection and try again.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 16,
        }}
      >
        <Display>Settings</Display>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Subscription ──────────────────────────────────────────────── */}
        <SectionHeader title="Subscription" />
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: SURFACE_ELEVATED,
            }}
          >
            <Ionicons
              name={isPaid ? "star" : "star-outline"}
              size={20}
              color={starColor}
              style={{ marginRight: 14 }}
            />
            <View style={{ flex: 1 }}>
              <Body className="font-semibold" style={isDevOverride ? { color: "#FFD60A" } : undefined}>
                {subscriptionLabel}
              </Body>
              <Caption style={{ marginTop: 2 }}>
                {isPaid
                  ? "Unlimited assets, history, and exports"
                  : "Limited to 3 assets and 3 months of history"}
              </Caption>
            </View>
          </View>

          {isPaid ? (
            <SettingsRow
              icon="card-outline"
              label="Manage subscription"
              onPress={() => {
                tapLight();
                openUrl(MANAGE_SUBSCRIPTION_URL);
              }}
            />
          ) : (
            <SettingsRow
              icon="rocket-outline"
              label="Upgrade to Premium"
              onPress={() => {
                tapLight();
                navigation.navigate("Paywall", { reason: "asset_limit" });
              }}
            />
          )}

          <SettingsRow
            icon="refresh-outline"
            label="Restore purchases"
            onPress={handleRestore}
            busy={restoring}
            isLast
          />
        </Card>

        {/* ── Support ───────────────────────────────────────────────────── */}
        <SectionHeader title="Support" />
        <Card>
          <SettingsRow
            icon="mail-outline"
            label="Contact support"
            onPress={() => {
              tapLight();
              openUrl(`mailto:${SUPPORT_EMAIL}`);
            }}
          />
          <SettingsRow
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => {
              tapLight();
              openUrl(PRIVACY_URL);
            }}
          />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => {
              tapLight();
              openUrl(TERMS_URL);
            }}
            isLast
          />
        </Card>

        {/* ── About ─────────────────────────────────────────────────────── */}
        <SectionHeader title="About" />
        <Card>
          <SettingsRow icon="information-circle-outline" label="Version" detail={versionLabel()} isLast />
        </Card>

        <Caption style={{ textAlign: "center", marginTop: 8 }}>
          NetWorth · Made by BMP Corpo
        </Caption>
      </ScrollView>
    </View>
  );
}
