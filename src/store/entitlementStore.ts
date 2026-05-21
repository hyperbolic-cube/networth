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
    if (__DEV__) {
      console.log('[entitlement DEBUG] active entitlements:', Object.keys(info.entitlements.active));
      console.log('[entitlement DEBUG] all entitlements:', Object.keys(info.entitlements.all));
      console.log('[entitlement DEBUG] active subscriptions:', info.activeSubscriptions);
      console.log('[entitlement DEBUG] checking for PREMIUM_ENTITLEMENT_ID:', PREMIUM_ENTITLEMENT_ID);
      console.log('[entitlement DEBUG] isPaid result:', PREMIUM_ENTITLEMENT_ID in info.entitlements.active);
    }
    const isPaid = PREMIUM_ENTITLEMENT_ID in info.entitlements.active;
    set({ isPaid, customerInfo: info, isLoading: false });
  },
}));
