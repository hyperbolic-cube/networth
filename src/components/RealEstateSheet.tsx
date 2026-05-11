import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { View } from "react-native";
import { MoneyInput } from "./MoneyInput";
import { SegmentedToggle } from "./SegmentedToggle";
import { SheetScaffold } from "./SheetScaffold";
import { Body, Caption } from "./Typography";
import { useAssetsStore } from "../store/assetsStore";

// ── RealEstateSheet ────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { label: "USD", value: "USD" },
  { label: "KZT", value: "KZT" },
  { label: "EUR", value: "EUR" },
  { label: "RUB", value: "RUB" },
] as const;

interface RealEstateSheetProps {
  onSaved?: () => void;
}

/**
 * Bottom-sheet input form for real estate assets.
 * Value is computed as sqm × price_per_sqm.
 */
export const RealEstateSheet = forwardRef<
  BottomSheetModal,
  RealEstateSheetProps
>(function RealEstateSheet({ onSaved }, ref) {
  const [name, setName] = useState("");
  const [sqm, setSqm] = useState("");
  const [pricePerSqm, setPricePerSqm] = useState("");
  const [currency, setCurrency] = useState("USD");

  const sqmNum = Number(sqm);
  const priceNum = Number(pricePerSqm);
  const total = sqmNum > 0 && priceNum > 0 ? sqmNum * priceNum : null;

  const isValid = name.trim().length > 0 && sqmNum > 0 && priceNum > 0;

  /** Format a number with thousands separators, no decimals. */
  function fmt(n: number): string {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  async function handleSave() {
    if (!isValid) return;
    await useAssetsStore.getState().add({
      type: "REAL_ESTATE",
      name: name.trim(),
      currency,
      metadata: { sqm: sqmNum, price_per_sqm: priceNum },
    });
    // Reset form.
    setName("");
    setSqm("");
    setPricePerSqm("");
    setCurrency("USD");
    (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
    onSaved?.();
  }

  return (
    <SheetScaffold
      ref={ref}
      title="Real Estate"
      emoji="🏘️"
      onSubmit={handleSave}
      submitDisabled={!isValid}
    >
      {/* Name */}
      <View className="gap-y-1">
        <Caption>Property name</Caption>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Main Apartment"
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

      {/* Area */}
      <View className="gap-y-1">
        <Caption>Area (m²)</Caption>
        <MoneyInput value={sqm} onChangeText={setSqm} placeholder="0" />
      </View>

      {/* Price per sqm */}
      <View className="gap-y-1">
        <Caption>Current market price per m²</Caption>
        <MoneyInput
          value={pricePerSqm}
          onChangeText={setPricePerSqm}
          placeholder="0"
        />
      </View>

      {/* Live total */}
      {total !== null && (
        <View className="mt-1">
          <Body>
            {fmt(sqmNum)} m² × {currency}
            {fmt(priceNum)} ={" "}
            <Body className="font-bold text-positive">
              {currency}
              {fmt(total)}
            </Body>
          </Body>
        </View>
      )}

      {/* Currency */}
      <View className="gap-y-1">
        <Caption>Currency</Caption>
        <SegmentedToggle
          options={CURRENCY_OPTIONS}
          value={currency}
          onChange={setCurrency}
        />
      </View>
    </SheetScaffold>
  );
});
