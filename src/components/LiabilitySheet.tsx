import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { Alert, View } from "react-native";
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

    const parsedPrincipal = Number(principal);
    const parsedRate = Number(interestRate);
    const parsedPayment = Number(monthlyPayment);
    const isValid =
      name.trim().length > 0 &&
      Number.isFinite(parsedPrincipal) &&
      parsedPrincipal > 0 &&
      Number.isFinite(parsedRate) &&
      parsedRate >= 0 &&
      Number.isFinite(parsedPayment) &&
      parsedPayment > 0;

    async function handleSave() {
      if (name.trim().length === 0) {
        Alert.alert("Missing name", "Please enter a name.");
        return;
      }
      if (!Number.isFinite(parsedPrincipal) || parsedPrincipal <= 0) {
        Alert.alert("Invalid principal", "Please enter a valid principal amount.");
        return;
      }
      if (!Number.isFinite(parsedRate) || parsedRate < 0) {
        Alert.alert("Invalid interest rate", "Please enter a valid annual rate (0 or higher).");
        return;
      }
      if (!Number.isFinite(parsedPayment) || parsedPayment <= 0) {
        Alert.alert("Invalid monthly payment", "Please enter a valid monthly payment.");
        return;
      }
      try {
        await useAssetsStore.getState().add({
          type: liabilityType,
          name: name.trim(),
          currency,
          metadata: {
            principal: parsedPrincipal,
            interest_rate: parsedRate,
            monthly_payment: parsedPayment,
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
      } catch (err) {
        console.error("[LiabilitySheet] save failed:", err);
        Alert.alert(
          "Couldn't save",
          err instanceof Error ? err.message : "Please try again."
        );
      }
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
            onChangeText={(t) => {
              try {
                setName(t);
              } catch (err) {
                console.error("[LiabilitySheet] name onChange threw:", err);
              }
            }}
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
