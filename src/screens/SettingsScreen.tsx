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
import { Display } from "../components/Typography";
import { tapLight } from "../utils/haptics";
import type { SettingsScreenProps } from "../types/navigation";

// ── Theme ──────────────────────────────────────────────────────────────────

const POSITIVE = "#30D158";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#8E8E93";
const SURFACE = "#1C1C1E";
const DIVIDER = "#38383A";
const HEADER_HORIZONTAL_PADDING = 24;
const CARD_HORIZONTAL_MARGIN = 16;
const ROW_HORIZONTAL_PADDING = 16;
const ICON_SIZE = 24;
const ICON_GAP = 16;
const DIVIDER_INSET = ROW_HORIZONTAL_PADDING + ICON_SIZE + ICON_GAP; // 56pt

// ── Constants ────────────────────────────────────────────────────────────────
// Support address + legal URLs are placeholders pending ASO (DECISIONS.md
// 2026-05-21). Confirm bmpcorporation@gmail.com is monitored before release.

const SUPPORT_EMAIL = "bmpcorporation@gmail.com";
const TERMS_URL = "https://hyperbolic-cube.github.io/networth-legal/terms.html";
const PRIVACY_URL = "https://hyperbolic-cube.github.io/networth-legal/privacy.html";
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

function formatRenewalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

// ── Primitives ──────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  iconColor,
  label,
  labelColor,
  subtitle,
  detail,
  onPress,
  busy,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  labelColor?: string;
  subtitle?: string;
  detail?: string;
  onPress?: () => void;
  busy?: boolean;
  isLast?: boolean;
}) {
  const interactive = onPress !== undefined;
  return (
    <>
      <Pressable
        onPress={interactive ? onPress : undefined}
        disabled={!interactive || busy}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: ROW_HORIZONTAL_PADDING,
          minHeight: 56,
          opacity: pressed && interactive ? 0.55 : 1,
        })}
      >
        <Ionicons
          name={icon}
          size={ICON_SIZE}
          color={iconColor ?? TEXT_SECONDARY}
          style={{ marginRight: ICON_GAP }}
        />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text
            style={{ color: labelColor ?? TEXT_PRIMARY, fontSize: 16 }}
            numberOfLines={1}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {busy ? (
          <ActivityIndicator color={TEXT_SECONDARY} />
        ) : detail ? (
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 15,
              marginLeft: 8,
              marginRight: interactive ? 6 : 0,
            }}
          >
            {detail}
          </Text>
        ) : null}
        {interactive ? (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={TEXT_SECONDARY}
            style={{ marginLeft: 4 }}
          />
        ) : null}
      </Pressable>
      {!isLast ? (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            marginLeft: DIVIDER_INSET,
            backgroundColor: DIVIDER,
          }}
        />
      ) : null}
    </>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={{ paddingLeft: ROW_HORIZONTAL_PADDING, paddingTop: 24, paddingBottom: 8 }}>
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: CARD_HORIZONTAL_MARGIN,
        marginBottom: 8,
        borderRadius: 12,
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
  const premiumEntitlement = customerInfo?.entitlements.active["premium"];

  const subscriptionTitle = (() => {
    if (!isPaid) return "Free plan";
    const productId = premiumEntitlement?.productIdentifier ?? "";
    if (productId.includes("annual")) return "Premium — Annual";
    if (productId.includes("monthly")) return "Premium — Monthly";
    return "Premium";
  })();

  const subscriptionSubtitle = (() => {
    if (!isPaid) return "Limited to 3 assets and 3 snapshots";
    if (isDevOverride) return "Developer override active";
    const date = formatRenewalDate(premiumEntitlement?.expirationDate);
    if (!date) return "Active subscription";
    const willRenew = premiumEntitlement?.willRenew ?? true;
    return willRenew ? `Renews ${date}` : `Expires ${date}`;
  })();

  const subscriptionIcon: keyof typeof Ionicons.glyphMap = isPaid
    ? "checkmark-circle"
    : "star-outline";
  const subscriptionIconColor = isPaid
    ? isDevOverride
      ? "#FFD60A"
      : POSITIVE
    : TEXT_SECONDARY;
  const subscriptionLabelColor = isDevOverride ? "#FFD60A" : undefined;

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
          paddingHorizontal: HEADER_HORIZONTAL_PADDING,
          paddingBottom: 8,
        }}
      >
        <Display>Settings</Display>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Subscription ──────────────────────────────────────────────── */}
        <SectionHeader title="Subscription" />
        <Card>
          <SettingsRow
            icon={subscriptionIcon}
            iconColor={subscriptionIconColor}
            label={subscriptionTitle}
            labelColor={subscriptionLabelColor}
            subtitle={subscriptionSubtitle}
          />

          {isPaid ? (
            <SettingsRow
              icon="settings-outline"
              label="Manage Subscription"
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
            label="Restore Purchases"
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
            label="Contact Support"
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
          <SettingsRow
            icon="information-circle-outline"
            label="Version"
            detail={versionLabel()}
            isLast
          />
        </Card>
      </ScrollView>
    </View>
  );
}
