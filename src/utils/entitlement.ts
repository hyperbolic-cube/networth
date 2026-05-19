import { useEntitlementStore } from "../store/entitlementStore";

export type PaywallReason =
  | "asset_limit"
  | "snapshot_limit"
  | "edit_locked"
  | "export";

export interface PaywallTriggerResult {
  shouldShow: boolean;
  message: string;
}

/** React selector hook — call inside components. */
export function useIsPaid(): boolean {
  return useEntitlementStore((s) => s.isPaid);
}

/**
 * Non-hook utility — safe to call in event handlers and store actions.
 * Phase 9.2 callers pair this with a free-tier count check before showing
 * the paywall (e.g. getAssetsCount() >= 3 && getPaywallTrigger('asset_limit').shouldShow).
 */
export function getPaywallTrigger(reason: PaywallReason): PaywallTriggerResult {
  const isPaid = useEntitlementStore.getState().isPaid;
  const messages: Record<PaywallReason, string> = {
    asset_limit: "Upgrade to add unlimited assets",
    snapshot_limit: "Upgrade to track unlimited months",
    edit_locked: "Upgrade to edit any snapshot",
    export: "Upgrade to export your data to CSV",
  };
  return { shouldShow: !isPaid, message: messages[reason] };
}
