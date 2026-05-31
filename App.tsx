import "react-native-gesture-handler";
import "./src/global.css";

import { NavigationContainer } from "@react-navigation/native";
import type { InitialState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo } from "react-native-purchases";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { initDatabase } from "./src/db/schema";
import { getLatestSnapshot } from "./src/db/snapshots";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { GridScreen } from "./src/screens/GridScreen";
import { PaywallScreen } from "./src/screens/PaywallScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SnapshotDetailScreen } from "./src/screens/SnapshotDetailScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { useAssetsStore } from "./src/store/assetsStore";
import { useEntitlementStore } from "./src/store/entitlementStore";
import { getMissedMonths, autoFillMissedSnapshots } from "./src/utils/autofill";
import { initClock } from "./src/utils/clock";
import type { RootStackParamList, TabParamList } from "./src/types/navigation";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function InitErrorBanner({
  errors,
  onDismiss,
}: {
  errors: string[];
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ backgroundColor: "#8B0000", paddingTop: 52, paddingHorizontal: 12, paddingBottom: 12 }}>
      <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 13, lineHeight: 18 }}>
          {"⚠️"} {errors.length} init error{errors.length > 1 ? "s" : ""}:{" "}
          {errors[0]}
          {errors.length > 1 && !expanded ? "  (tap for more)" : ""}
        </Text>
        {expanded && (
          <ScrollView style={{ maxHeight: 160, marginTop: 6 }}>
            {errors.slice(1).map((e, i) => (
              <Text key={i} style={{ color: "#FFB3B3", fontSize: 12, marginTop: 3 }}>
                {"  • "}
                {e}
              </Text>
            ))}
          </ScrollView>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={{ marginTop: 8 }}>
        <Text style={{ color: "#FFB3B3", fontSize: 12, textDecorationLine: "underline" }}>
          Dismiss
        </Text>
      </TouchableOpacity>
    </View>
  );
}

async function initRevenueCat(): Promise<void> {
  const apiKey =
    Platform.OS === "ios"
      ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "")
      : (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "");

  if (!apiKey) {
    console.warn(
      "[RC] No API key configured — entitlement checks default to free tier"
    );
    return;
  }

  await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });
}

function setupRCListener(): void {
  Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
    useEntitlementStore.getState()._setFromCustomerInfo(info);
  });
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Active/inactive Ionicons per tab.
const TAB_ICON: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Today: "wallet",
  Dashboard: "stats-chart",
  Settings: "settings-sharp",
};

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0A84FF",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarStyle: {
          backgroundColor: "#1C1C1E",
          borderTopColor: "#2C2C2E",
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICON[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  // undefined until init resolves which tab/onboarding state to land on.
  const [initialState, setInitialState] = useState<InitialState | undefined>(undefined);
  const [autoFillProgress, setAutoFillProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [initErrors, setInitErrors] = useState<string[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const errors: string[] = [];

      // Step 1: database
      try {
        await initDatabase();
      } catch (err) {
        const msg = `initDatabase: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Step 2: clock
      try {
        await initClock();
      } catch (err) {
        const msg = `initClock: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Step 3: RevenueCat (10 s timeout — configure + network handshake can hang)
      try {
        await withTimeout(initRevenueCat(), 10_000, "initRevenueCat");
        setupRCListener();
        if (__DEV__) {
          console.log(
            "[RC] If this is first run after package install, run " +
              "`eas build --profile development --platform ios` (or android) " +
              "to include native module — Metro alone won't pick up RC native code."
          );
        }
      } catch (err) {
        const msg = `initRevenueCat: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Step 4: autofill missed snapshots (DB-only, no network)
      let latest: Awaited<ReturnType<typeof getLatestSnapshot>> | null = null;
      try {
        latest = await getLatestSnapshot();
        const missed = getMissedMonths(latest?.locked_at ?? null);
        if (missed.length > 0) {
          setAutoFillProgress({ current: 0, total: missed.length });
          await autoFillMissedSnapshots(missed, (current, total) => {
            setAutoFillProgress({ current, total });
          });
        }
      } catch (err) {
        const msg = `autofill: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Step 5: load assets into store
      try {
        await useAssetsStore.getState().load();
      } catch (err) {
        const msg = `assetsStore.load: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Step 6: entitlement refresh (10 s timeout — Purchases.getCustomerInfo() is a network call)
      try {
        await withTimeout(
          useEntitlementStore.getState().refresh(),
          10_000,
          "entitlement.refresh"
        );
      } catch (err) {
        const msg = `entitlement.refresh: ${errMsg(err)}`;
        console.error("[App init]", msg);
        errors.push(msg);
      }

      // Compute initial route — null-safe: if DB failed, latest=null → Today tab (safe fallback)
      const hasAssets = useAssetsStore.getState().items.length > 0;
      const initialTab = latest !== null ? "Dashboard" : "Today";
      setInitialState(
        hasAssets
          ? { routes: [{ name: "Tabs", state: { routes: [{ name: initialTab }] } }] }
          : {
              routes: [
                { name: "Tabs", state: { routes: [{ name: "Today" }] } },
                { name: "Grid" },
              ],
            }
      );

      if (errors.length > 0) setInitErrors(errors);
      setReady(true);
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          {!bannerDismissed && initErrors.length > 0 && (
            <InitErrorBanner
              errors={initErrors}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}
          {ready ? (
            <ErrorBoundary>
              <NavigationContainer initialState={initialState}>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="Tabs" component={MainTabs} />
                  <Stack.Screen name="Grid" component={GridScreen} />
                  <Stack.Screen name="SnapshotDetail" component={SnapshotDetailScreen} />
                  <Stack.Screen
                    name="Paywall"
                    component={PaywallScreen}
                    options={{ presentation: "modal", headerShown: false, gestureEnabled: true }}
                  />
                </Stack.Navigator>
              </NavigationContainer>
            </ErrorBoundary>
          ) : (
            <View className="flex-1 bg-background items-center justify-center gap-y-4">
              <Text className="text-textPrimary text-2xl font-bold">
                NetWorth
              </Text>
              <ActivityIndicator color="#8E8E93" />
              {autoFillProgress !== null && (
                <Text style={{ color: "#8E8E93", fontSize: 13 }}>
                  Auto-filling month {autoFillProgress.current + 1} of{" "}
                  {autoFillProgress.total}…
                </Text>
              )}
            </View>
          )}
          <StatusBar style="light" />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
