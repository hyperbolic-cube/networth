import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { Alert, View } from "react-native";
import { MoneyInput } from "./MoneyInput";
import { PricePreview } from "./PricePreview";
import { SegmentedToggle } from "./SegmentedToggle";
import { SheetScaffold } from "./SheetScaffold";
import { Caption } from "./Typography";
import { useAssetsStore } from "../store/assetsStore";

// ── BrokerSheet ────────────────────────────────────────────────────────────
//
// Handles both "stock" (📈 Broker Accounts, Stock/Bond toggle) and "crypto"
// (₿ Crypto, fixed CRYPTO instrumentType) modes in one component.

const INSTRUMENT_OPTIONS = [
  { label: "Stock", value: "STOCK" },
  { label: "Bond", value: "BOND" },
] as const;

interface BrokerSheetProps {
  /** "stock" shows the Stock/Bond toggle; "crypto" locks to CRYPTO. */
  mode: "stock" | "crypto";
  onSaved?: () => void;
}

/**
 * Bottom-sheet input form for broker accounts (stocks/bonds) and crypto.
 * Currency is fixed USD — broker APIs return USD prices.
 */
export const BrokerSheet = forwardRef<BottomSheetModal, BrokerSheetProps>(
  function BrokerSheet({ mode, onSaved }, ref) {
    const [name, setName] = useState("");
    const [instrumentType, setInstrumentType] = useState<"STOCK" | "BOND">(
      "STOCK"
    );
    const [ticker, setTicker] = useState("");
    const [quantity, setQuantity] = useState("");

    const parsedQty = Number(quantity);
    const isValid =
      name.trim().length > 0 &&
      ticker.trim().length > 0 &&
      Number.isFinite(parsedQty) &&
      parsedQty > 0;

    async function handleSave() {
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        Alert.alert("Invalid quantity", "Please enter a valid quantity.");
        return;
      }
      if (name.trim().length === 0 || ticker.trim().length === 0) {
        Alert.alert("Missing info", "Please enter a name and symbol.");
        return;
      }
      try {
        const finalInstrumentType =
          mode === "crypto" ? "CRYPTO" : instrumentType;
        await useAssetsStore.getState().add({
          type: "BROKER",
          name: name.trim(),
          currency: "USD",
          metadata: {
            instrumentType: finalInstrumentType,
            ticker: ticker.trim().toUpperCase(),
            quantity: parsedQty,
          },
        });
        // Reset form.
        setName("");
        setInstrumentType("STOCK");
        setTicker("");
        setQuantity("");
        (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
        onSaved?.();
      } catch (err) {
        console.error("[BrokerSheet] save failed:", err);
        Alert.alert(
          "Couldn't save",
          err instanceof Error ? err.message : "Please try again."
        );
      }
    }

    return (
      <SheetScaffold
        ref={ref}
        title={mode === "crypto" ? "Crypto" : "Broker Accounts"}
        emoji={mode === "crypto" ? "₿" : "📈"}
        onSubmit={handleSave}
        submitDisabled={!isValid}
      >
        {/* Name */}
        <View className="gap-y-1">
          <Caption>{mode === "crypto" ? "Label" : "Account name"}</Caption>
          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={
              mode === "crypto" ? "e.g. Bitcoin" : "e.g. Tesla Shares"
            }
            placeholderTextColor="#8E8E93"
            style={{
              fontSize: 16,
              color: "#FFFFFF",
              backgroundColor: "#2C2C2E",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />
        </View>

        {/* Stock / Bond toggle (stock mode only) */}
        {mode === "stock" && (
          <View className="gap-y-1">
            <Caption>Type</Caption>
            <SegmentedToggle
              options={INSTRUMENT_OPTIONS}
              value={instrumentType}
              onChange={(v) => setInstrumentType(v as "STOCK" | "BOND")}
            />
          </View>
        )}

        {/* Ticker */}
        <View className="gap-y-1">
          <Caption>Symbol</Caption>
          <BottomSheetTextInput
            value={ticker}
            onChangeText={(t) => setTicker(t.toUpperCase())}
            placeholder={mode === "crypto" ? "e.g. BTC, ETH" : "e.g. TSLA, AAPL"}
            placeholderTextColor="#8E8E93"
            autoCapitalize="characters"
            style={{
              fontSize: 16,
              color: "#FFFFFF",
              backgroundColor: "#2C2C2E",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />
          <Caption>
            {mode === "stock"
              ? "US-listed tickers (e.g. TSLA, AAPL)"
              : "e.g. BTC, ETH"}
          </Caption>
        </View>

        {/* Quantity */}
        <View className="gap-y-1">
          <Caption>Quantity</Caption>
          <MoneyInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="0"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Live price preview */}
        <PricePreview ticker={ticker} quantity={quantity} mode={mode} />
      </SheetScaffold>
    );
  }
);
