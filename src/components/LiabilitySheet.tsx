import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { View } from "react-native";
import { MoneyInput } from "./MoneyInput";
import { SegmentedToggle } from "./SegmentedToggle";
import { SheetScaffold } from "./SheetScaffold";
import { Caption } from "./Typography";
import { useAssetsStore } from "../store/assetsStore";

// ── LiabilitySheet ─────────────────────────────────────────────────────────
//
// Handles MORTGAGE and CREDIT_DEBT. AUTO_LOAN is intentionally excluded from
// the Phase 4 grid (see DECISIONS.md 2026-05-11).

interface TypeConfig {
  emoji: string;
  title: string;
  namePlaceholder: string;
}

const CONFIG: Record<"MORTGAGE" | "CREDIT_DEBT", TypeConfig> = {
  MORTGAGE: {
    emoji: "🏠",
    title: "Mortgage",
    namePlaceholder: "e.g. Home Loan",
  },
  CREDIT_DEBT: {
    emoji: "💳",
    title: "Credit Debt",
    namePlaceholder: "e.g. Visa",
  },
};

const CURRENCY_OPTIONS = [
  { label: "USD", value: "USD" },
  { label: "KZT", value: "KZT" },
  { label: "EUR", value: "EUR" },
  { label: "RUB", value: "RUB" },
] as const;

interface LiabilitySheetProps {
  liabilityType: "MORTGAGE" | "CREDIT_DEBT";
  onSaved?: () => void;
}

/**
 * Bottom-sheet input form for mortgage and credit-debt liabilities.
 * Collects principal, annual interest rate, and monthly payment.
 */
export const LiabilitySheet = forwardRef<BottomSheetModal, LiabilitySheetProps>(
  function LiabilitySheet({ liabilityType, onSaved }, ref) {
    const cfg = CONFIG[liabilityType];

    const [name, setName] = useState("");
    const [principal, setPrincipal] = useState("");
    const [interestRate, setInterestRate] = useState("");
    const [monthlyPayment, setMonthlyPayment] = useState("");
    const [currency, setCurrency] = useState("USD");

    const isValid =
      name.trim().length > 0 &&
      Number(principal) > 0 &&
      Number(interestRate) >= 0 &&
      Number(monthlyPayment) > 0;

    async function handleSave() {
      if (!isValid) return;
      await useAssetsStore.getState().add({
        type: liabilityType,
        name: name.trim(),
        currency,
        metadata: {
          principal: Number(principal),
          interest_rate: Number(interestRate),
          monthly_payment: Number(monthlyPayment),
        },
      });
      // Reset form.
      setName("");
      setPrincipal("");
      setInterestRate("");
      setMonthlyPayment("");
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
          <Caption>Name</Caption>
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

        {/* Principal */}
        <View className="gap-y-1">
          <Caption>Current principal (total owed right now)</Caption>
          <MoneyInput
            value={principal}
            onChangeText={setPrincipal}
            placeholder="0"
          />
        </View>

        {/* Interest rate */}
        <View className="gap-y-1">
          <Caption>Annual interest rate (%)</Caption>
          <MoneyInput
            value={interestRate}
            onChangeText={setInterestRate}
            placeholder="0"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Monthly payment */}
        <View className="gap-y-1">
          <Caption>Monthly payment</Caption>
          <MoneyInput
            value={monthlyPayment}
            onChangeText={setMonthlyPayment}
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
  }
);
