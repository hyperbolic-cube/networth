import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { forwardRef, useEffect, useState } from "react";
import { MoneyInput } from "./MoneyInput";
import { SheetScaffold } from "./SheetScaffold";
import { Caption } from "./Typography";
import { View } from "react-native";

// ── EditValueSheet ─────────────────────────────────────────────────────────
//
// Lightweight bottom-sheet for editing a single numeric value in TodayScreen.
// Mounted once and reused for every row; re-seeded via the initialValue prop.

interface EditValueSheetProps {
  title: string;
  fieldLabel: string;
  initialValue: string;
  onSave: (value: number) => void;
}

/**
 * Single-field numeric bottom-sheet for inline value edits in the Draft view.
 * Pre-fills from `initialValue`; re-seeds via useEffect when that prop changes
 * so reopening the sheet for a different row resets the field correctly.
 */
export const EditValueSheet = forwardRef<BottomSheetModal, EditValueSheetProps>(
  function EditValueSheet({ title, fieldLabel, initialValue, onSave }, ref) {
    const [value, setValue] = useState(initialValue);

    // Re-seed when the parent changes which row is being edited.
    useEffect(() => {
      setValue(initialValue);
    }, [initialValue]);

    const numericValue = Number(value);
    const submitDisabled = !(numericValue > 0) || isNaN(numericValue);

    function handleSave() {
      if (submitDisabled) return;
      onSave(numericValue);
      (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
    }

    return (
      <SheetScaffold
        ref={ref}
        title={title}
        onSubmit={handleSave}
        submitLabel="Save"
        submitDisabled={submitDisabled}
      >
        <View className="gap-y-1">
          <Caption>{fieldLabel}</Caption>
          <MoneyInput
            value={value}
            onChangeText={setValue}
            placeholder="0"
            autoFocus
          />
        </View>
      </SheetScaffold>
    );
  }
);
