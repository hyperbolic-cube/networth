import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tapLight } from "../utils/haptics";
import { useIsPaid } from "../utils/entitlement";
import type { RootStackParamList } from "../types/navigation";
import { BrokerSheet } from "../components/BrokerSheet";
import { LiabilitySheet } from "../components/LiabilitySheet";
import { RealEstateSheet } from "../components/RealEstateSheet";
import { SimpleValueSheet } from "../components/SimpleValueSheet";
import { Tile } from "../components/Tile";
import { Body, Caption, Display } from "../components/Typography";
import { useAssetsStore } from "../store/assetsStore";
import { useClockStore } from "../store/clockStore";
import { createAsset, updateAsset } from "../db/assets";
import { resetDatabase, seedDatabase } from "../db/dev";
import { db } from "../db/client";
import { initDatabase } from "../db/schema";
import { getLatestSnapshot, lockSnapshot } from "../db/snapshots";
import { getMissedMonths, autoFillMissedSnapshots } from "../utils/autofill";
import { applyAmortization } from "../utils/amortization";

/** The 8 tiles shown in the grid, in order. No AUTO_LOAN tile (DECISIONS.md). */
const TILES = [
  { key: "bank",        emoji: "🏦", label: "Bank Accounts" },
  { key: "broker",      emoji: "📈", label: "Broker Accounts" },
  { key: "crypto",      emoji: "₿",  label: "Crypto" },
  { key: "realEstate",  emoji: "🏘️", label: "Real Estate" },
  { key: "vehicle",     emoji: "🚘", label: "Vehicles" },
  { key: "cash",        emoji: "💵", label: "Cash" },
  { key: "mortgage",    emoji: "🏠", label: "Mortgage" },
  { key: "credit",      emoji: "💳", label: "Credit Debt" },
] as const;

type TileKey = (typeof TILES)[number]["key"];

export function GridScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const items = useAssetsStore((s) => s.items);
  const isPaid = useIsPaid();

  // One ref per sheet instance.
  const bankRef      = useRef<BottomSheetModal>(null);
  const brokerRef    = useRef<BottomSheetModal>(null);
  const cryptoRef    = useRef<BottomSheetModal>(null);
  const realEstateRef = useRef<BottomSheetModal>(null);
  const vehicleRef   = useRef<BottomSheetModal>(null);
  const cashRef      = useRef<BottomSheetModal>(null);
  const mortgageRef  = useRef<BottomSheetModal>(null);
  const creditRef    = useRef<BottomSheetModal>(null);

  function handleTilePress(key: TileKey) {
    if (!isPaid && items.length >= 3) {
      tapLight();
      navigation.navigate("Paywall", { reason: "asset_limit" });
      return;
    }
    switch (key) {
      case "bank":       bankRef.current?.present();       break;
      case "broker":     brokerRef.current?.present();     break;
      case "crypto":     cryptoRef.current?.present();     break;
      case "realEstate": realEstateRef.current?.present(); break;
      case "vehicle":    vehicleRef.current?.present();    break;
      case "cash":       cashRef.current?.present();       break;
      case "mortgage":   mortgageRef.current?.present();   break;
      case "credit":     creditRef.current?.present();     break;
    }
  }

  const mockDate = useClockStore((s) => s.mockDate);

  const [busy, setBusy] = useState<null | "reset" | "seed" | "resetAll" | "autofill" | "seedDashboard">(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function runAction(
    kind: "reset" | "seed" | "resetAll",
    fn: () => Promise<void>,
    msg: string,
  ) {
    tapLight();
    setBusy(kind);
    try {
      await fn();
      setConfirm(msg);
      setTimeout(() => setConfirm(null), 1000);
    } catch (err) {
      console.warn("[GridScreen debug]", err);
    } finally {
      setBusy(null);
    }
  }

  async function handleForceAutofill() {
    tapLight();
    setBusy("autofill");
    try {
      const latest = await getLatestSnapshot();
      const missed = getMissedMonths(latest?.locked_at ?? null);
      if (missed.length === 0) {
        setConfirm("No gaps — nothing to fill");
      } else {
        await autoFillMissedSnapshots(missed);
        await useAssetsStore.getState().load();
        setConfirm(`Filled ${missed.length} month(s)`);
      }
      setTimeout(() => setConfirm(null), 2000);
    } catch (err) {
      console.warn("[GridScreen debug] force autofill:", err);
      setConfirm("Auto-fill failed — see logs");
      setTimeout(() => setConfirm(null), 2000);
    } finally {
      setBusy(null);
    }
  }

  async function handleSeedDashboard() {
    tapLight();
    setBusy("seedDashboard");
    try {
      await resetDatabase();

      const bank = await createAsset({
        type: "BANK",
        name: "Demo Bank",
        currency: "USD",
        metadata: { amount: 10000 },
      });
      const broker = await createAsset({
        type: "BROKER",
        name: "TSLA",
        currency: "USD",
        metadata: { ticker: "TSLA", quantity: 20, instrumentType: "STOCK" },
      });
      const mortgage = await createAsset({
        type: "MORTGAGE",
        name: "Demo Mortgage",
        currency: "KZT",
        metadata: { principal: 50_000_000, interest_rate: 12, monthly_payment: 700_000 },
      });

      // Fixed demo prices per month — no live API calls
      const LOCK_DATES = [
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
        "2026-04-01T00:00:00.000Z",
        "2026-05-01T00:00:00.000Z",
      ];
      const TSLA_PRICES_USD = [250, 270, 255, 290, 310];
      const KZT_RATE = 1 / 450;
      let principal = 50_000_000;

      for (let i = 0; i < LOCK_DATES.length; i++) {
        useClockStore.getState().setMockDate(new Date(LOCK_DATES[i]));
        const tslaTotal = TSLA_PRICES_USD[i] * 20;
        await lockSnapshot({
          items: [
            {
              asset_liability_id: bank.id,
              value_in_original_currency: 10_000,
              exchange_rate_to_usd: 1,
              calculated_value_usd: 10_000,
            },
            {
              asset_liability_id: broker.id,
              value_in_original_currency: tslaTotal,
              exchange_rate_to_usd: 1,
              calculated_value_usd: tslaTotal,
            },
            {
              asset_liability_id: mortgage.id,
              value_in_original_currency: principal,
              exchange_rate_to_usd: KZT_RATE,
              calculated_value_usd: -(principal * KZT_RATE),
            },
          ],
          lockedAt: LOCK_DATES[i],
          isAutoFilled: 0,
        });
        principal = applyAmortization(principal, 12, 700_000);
      }

      // Persist post-amortization principal to assets_liabilities
      await updateAsset(mortgage.id, {
        metadata: { principal, interest_rate: 12, monthly_payment: 700_000 },
      });

      // Land on May 14 — outside lock window, Dashboard boots with 5 snapshots
      useClockStore.getState().setMockDate(new Date(2026, 4, 14));
      await useAssetsStore.getState().load();

      setConfirm("Dashboard demo ready — 5 snapshots");
      setTimeout(() => setConfirm(null), 3000);
      navigation.navigate("Dashboard");
    } catch (err) {
      console.warn("[GridScreen debug] seed dashboard:", err);
      setConfirm("Seed failed — see logs");
      setTimeout(() => setConfirm(null), 2000);
    } finally {
      setBusy(null);
    }
  }

  const FOOTER_HEIGHT = 88;

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

      <ScrollView
        contentContainerStyle={{
          paddingTop: __DEV__ && mockDate !== null ? 16 : insets.top + 16,
          paddingBottom: items.length > 0 ? FOOTER_HEIGHT + insets.bottom + 16 : 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-6 mb-6">
          <Display>What do you own and owe?</Display>
          <Caption className="mt-1">
            Tap a tile to add an asset or liability.
          </Caption>
        </View>

        {/* 2-column tile grid */}
        <View className="flex-row flex-wrap px-4 gap-y-3">
          {TILES.map((tile) => (
            <View key={tile.key} className="w-[48%] mx-[1%]">
              <Tile
                emoji={tile.emoji}
                label={tile.label}
                onPress={() => handleTilePress(tile.key)}
              />
            </View>
          ))}
        </View>

        {/* Added items list */}
        {items.length > 0 && (
          <View className="px-6 mt-8">
            <Body className="font-semibold mb-3">
              {items.length} item{items.length !== 1 ? "s" : ""} added
            </Body>
            <View className="gap-y-2">
              {items.map((item) => (
                <View
                  key={item.id}
                  className="bg-surface rounded-xl px-4 py-3 flex-row items-center justify-between"
                >
                  <Body className="flex-1" numberOfLines={1}>
                    {item.name}
                  </Body>
                  <Caption className="ml-2">
                    {item.type} · {item.currency}
                  </Caption>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Debug panel (DEV only) ──────────────────────────────────────── */}
        {__DEV__ && (
          <View className="mt-8 px-6">
            <View className="border border-negative rounded-xl p-4">
              {/* Header */}
              <Text className="text-negative font-bold text-sm mb-0.5">DEV</Text>
              <Text className="text-textSecondary text-xs mb-4">
                Debug — not shown in release builds
              </Text>

              {/* Buttons */}
              <View className="gap-y-2">
                <Pressable
                  disabled={busy !== null}
                  onPress={() =>
                    runAction(
                      "reset",
                      async () => {
                        await resetDatabase();
                        await useAssetsStore.getState().load();
                      },
                      "DB reset",
                    )
                  }
                  className="bg-surfaceElevated rounded-lg py-3 items-center"
                >
                  {busy === "reset" ? (
                    <ActivityIndicator size="small" color="#8E8E93" />
                  ) : (
                    <Text className="text-textPrimary text-sm">Reset (keep prices)</Text>
                  )}
                </Pressable>

                <Pressable
                  disabled={busy !== null}
                  onPress={() =>
                    runAction(
                      "seed",
                      async () => {
                        await resetDatabase();
                        await seedDatabase();
                        await useAssetsStore.getState().load();
                      },
                      "Reset + seeded",
                    )
                  }
                  className="bg-surfaceElevated rounded-lg py-3 items-center"
                >
                  {busy === "seed" ? (
                    <ActivityIndicator size="small" color="#8E8E93" />
                  ) : (
                    <Text className="text-textPrimary text-sm">Reset + Seed</Text>
                  )}
                </Pressable>

                <Pressable
                  disabled={busy !== null}
                  onPress={() =>
                    runAction(
                      "resetAll",
                      async () => {
                        await resetDatabase();
                        await db.execAsync("DROP TABLE IF EXISTS api_cache;");
                        await initDatabase();
                        await useAssetsStore.getState().load();
                      },
                      "Reset all",
                    )
                  }
                  className="bg-surfaceElevated rounded-lg py-3 items-center"
                >
                  {busy === "resetAll" ? (
                    <ActivityIndicator size="small" color="#8E8E93" />
                  ) : (
                    <Text className="text-negative text-sm">Reset all (incl. prices)</Text>
                  )}
                </Pressable>
              </View>

              {/* Confirmation */}
              {confirm !== null && (
                <Text className="text-positive text-xs text-center mt-3">{confirm}</Text>
              )}
            </View>

            {/* ── Time Travel ──────────────────────────────────────────── */}
            <View className="mt-4 border border-accent rounded-xl p-4">
              <Text className="text-accent font-bold text-sm mb-0.5">TIME TRAVEL</Text>
              <Text className="text-textSecondary text-xs mb-4">
                Mock date: {mockDate ? mockDate.toDateString() : "real time"}
              </Text>
              <View className="gap-y-2">
                <View className="flex-row gap-x-2">
                  <Pressable
                    onPress={() => { tapLight(); useClockStore.getState().advanceMockDate(86_400_000); }}
                    className="flex-1 bg-surfaceElevated rounded-lg py-3 items-center"
                  >
                    <Text className="text-textPrimary text-sm">+1 Day</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { tapLight(); useClockStore.getState().advanceMockDate(7 * 86_400_000); }}
                    className="flex-1 bg-surfaceElevated rounded-lg py-3 items-center"
                  >
                    <Text className="text-textPrimary text-sm">+1 Week</Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-x-2">
                  <Pressable
                    onPress={() => { tapLight(); useClockStore.getState().advanceMockMonth(); }}
                    className="flex-1 bg-surfaceElevated rounded-lg py-3 items-center"
                  >
                    <Text className="text-textPrimary text-sm">+1 Month</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { tapLight(); useClockStore.getState().setMockDate(null); }}
                    className="flex-1 bg-surfaceElevated rounded-lg py-3 items-center"
                  >
                    <Text className="text-accent text-sm">Reset time</Text>
                  </Pressable>
                </View>
                <Pressable
                  disabled={busy !== null}
                  onPress={handleForceAutofill}
                  className="bg-surfaceElevated rounded-lg py-3 items-center"
                >
                  {busy === "autofill" ? (
                    <ActivityIndicator size="small" color="#8E8E93" />
                  ) : (
                    <Text className="text-accent text-sm">Force autofill</Text>
                  )}
                </Pressable>
                <Pressable
                  disabled={busy !== null}
                  onPress={handleSeedDashboard}
                  className="bg-surfaceElevated rounded-lg py-3 items-center"
                >
                  {busy === "seedDashboard" ? (
                    <ActivityIndicator size="small" color="#8E8E93" />
                  ) : (
                    <Text className="text-accent text-sm">Seed Dashboard demo</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Review Snapshot footer — only shown when there are items */}
      {items.length > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#1C1C1E",
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: "#2C2C2E",
          }}
        >
          <Pressable
            onPress={() => {
              tapLight();
              navigation.navigate("Today");
            }}
            style={{
              backgroundColor: "#0A84FF",
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
              View Today
            </Text>
          </Pressable>
        </View>
      )}

      {/* Bottom sheets — mounted here so they're in the BottomSheetModalProvider subtree */}
      <SimpleValueSheet ref={bankRef}      assetType="BANK" />
      <SimpleValueSheet ref={cashRef}      assetType="CASH" />
      <SimpleValueSheet ref={vehicleRef}   assetType="VEHICLE" />
      <BrokerSheet      ref={brokerRef}    mode="stock" />
      <BrokerSheet      ref={cryptoRef}    mode="crypto" />
      <RealEstateSheet  ref={realEstateRef} />
      <LiabilitySheet   ref={mortgageRef}  liabilityType="MORTGAGE" />
      <LiabilitySheet   ref={creditRef}    liabilityType="CREDIT_DEBT" />
    </View>
  );
}
