import Purchases from "react-native-purchases";
import type { CustomerInfo } from "react-native-purchases";
import { create } from "zustand";

const PREMIUM_ENTITLEMENT_ID = "premium";

interface EntitlementState {
  isPaid: boolean;
  customerInfo: CustomerInfo | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  _setFromCustomerInfo: (info: CustomerInfo) => void;
}

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  isPaid: false,
  customerInfo: null,
  isLoading: true,

  async refresh() {
    if (!(await Purchases.isConfigured())) {
      set({ isLoading: false, isPaid: false });
      return;
    }
    try {
      const info = await Purchases.getCustomerInfo();
      get()._setFromCustomerInfo(info);
    } catch (err) {
      console.warn("[entitlementStore] refresh failed:", err);
      set({ isLoading: false });
    }
  },

  _setFromCustomerInfo(info) {
    const isPaid = PREMIUM_ENTITLEMENT_ID in info.entitlements.active;
    set({ isPaid, customerInfo: info, isLoading: false });
  },
}));
