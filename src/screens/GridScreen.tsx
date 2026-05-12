import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tapLight } from "../utils/haptics";
import { BrokerSheet } from "../components/BrokerSheet";
import { LiabilitySheet } from "../components/LiabilitySheet";
import { RealEstateSheet } from "../components/RealEstateSheet";
import { SimpleValueSheet } from "../components/SimpleValueSheet";
import { Tile } from "../components/Tile";
import { Body, Caption, Display } from "../components/Typography";
import { useAssetsStore } from "../store/assetsStore";
import { resetDatabase, seedDatabase } from "../db/dev";
import { db } from "../db/client";
import { initDatabase } from "../db/schema";

// ── GridScreen ─────────────────────────────────────────────────────────────
//
// Phase 4: single screen, no router. Navigation deferral plan:
//   Phase 4 — GridScreen only, no navigation library.
//   Phase 5b — useState<"grid" | "today"> to switch between Grid and Today;
//               still no router library.
//   Phase 7 — add @react-navigation/native-stack when Dashboard ↔ history
//              back-navigation actually needs a stack.
//   Never add expo-router at any phase.

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

interface GridScreenProps {
  onOpenToday: () => void;
}

/**
 * The Grid screen — first screen the user sees.
 * Renders 8 preset tiles that open type-specific bottom-sheet modals.
 */
export function GridScreen({ onOpenToday }: GridScreenProps) {
  const insets = useSafeAreaInsets();
  const items = useAssetsStore((s) => s.items);

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

  const [busy, setBusy] = useState<null | "reset" | "seed" | "resetAll">(null);
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

  const FOOTER_HEIGHT = 88;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
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
              onOpenToday();
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
