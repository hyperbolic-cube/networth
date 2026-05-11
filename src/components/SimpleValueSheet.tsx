import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { Text, View } from "react-native";
import { MoneyInput } from "./MoneyInput";
import { SegmentedToggle } from "./SegmentedToggle";
import { SheetScaffold } from "./SheetScaffold";
import { Caption } from "./Typography";
import { useAssetsStore } from "../store/assetsStore";

// ── SimpleValueSheet ───────────────────────────────────────────────────────
//
// Single sheet for BANK, CASH, and VEHICLE assets — all "name + amount +
// currency" with different labels/emoji. Parameterised by assetType.

/** Per-type UI configuration. */
interface TypeConfig {
  emoji: string;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  amountLabel: string;
}

const CONFIG: Record<"BANK" | "CASH" | "VEHICLE", TypeConfig> = {
  BANK: {
    emoji: "🏦",
    title: "Bank Accounts",
    nameLabel: "Account name",
    namePlaceholder: "e.g. Chase Checking",
    amountLabel: "Total balance (incl. deposits, cards, bonuses)",
  },
  CASH: {
    emoji: "💵",
    title: "Cash",
    nameLabel: "Label",
    namePlaceholder: "e.g. Wallet",
    amountLabel: "Amount",
  },
  VEHICLE: {
    emoji: "🚘",
    title: "Vehicles",
    nameLabel: "Vehicle",
    namePlaceholder: "e.g. Tesla Model 3",
    amountLabel: "Current market value",
  },
};

const CURRENCY_OPTIONS = [
  { label: "USD", value: "USD" },
  { label: "KZT", value: "KZT" },
  { label: "EUR", value: "EUR" },
  { label: "RUB", value: "RUB" },
] as const;

interface SimpleValueSheetProps {
  assetType: "BANK" | "CASH" | "VEHICLE";
  /** Called after a successful save so the parent can stay in sync. */
  onSaved?: () => void;
}

/**
 * Bottom-sheet input form for BANK, CASH, and VEHICLE assets.
 * Shares a single implementation with per-type label/emoji config.
 */
export const SimpleValueSheet = forwardRef<
  BottomSheetModal,
  SimpleValueSheetProps
>(function SimpleValueSheet({ assetType, onSaved }, ref) {
  const cfg = CONFIG[assetType];

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  const isValid = name.trim().length > 0 && Number(amount) > 0;

  async function handleSave() {
    if (!isValid) return;
    await useAssetsStore.getState().add({
      type: assetType,
      name: name.trim(),
      currency,
      metadata: { amount: Number(amount) },
    });
    // Reset form.
    setName("");
    setAmount("");
    setCurrency("USD");
    (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
    onSaved?.();
  }

  return (
    <SheetScaffold
      ref={ref}
      title={cfg.title}
      emoji={cfg.emoji}
      onSubmit={handleSave}
      submitDisabled={!isValid}
    >
      {/* Name */}
      <View className="gap-y-1">
        <Caption>{cfg.nameLabel}</Caption>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder={cfg.namePlaceholder}
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

      {/* Amount */}
      <View className="gap-y-1">
        <Caption>{cfg.amountLabel}</Caption>
        <MoneyInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
        />
      </View>

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
