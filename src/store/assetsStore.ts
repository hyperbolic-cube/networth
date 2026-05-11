import { create } from "zustand";
import {
  createAsset,
  deleteAsset,
  getAllAssets,
  updateAsset,
} from "../db/assets";
import type { AssetLiability, AssetMetadata, ItemType } from "../types";

// ── Assets store ───────────────────────────────────────────────────────────

interface AssetsState {
  items: AssetLiability[];
  loading: boolean;

  /** Load all assets_liabilities rows from SQLite into state. */
  load: () => Promise<void>;

  /** Insert a new asset and append it to state. */
  add: (input: {
    type: ItemType;
    name: string;
    currency: string;
    metadata: AssetMetadata;
  }) => Promise<void>;

  /** Update an existing asset by id and refresh state. */
  update: (
    id: string,
    updates: Partial<Pick<AssetLiability, "name" | "currency" | "metadata">>
  ) => Promise<void>;

  /** Delete an asset by id and remove it from state. */
  remove: (id: string) => Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  items: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const items = await getAllAssets();
      set({ items, loading: false });
    } catch (err) {
      console.error("[assetsStore] load failed:", err);
      set({ loading: false });
    }
  },

  async add(input) {
    try {
      const created = await createAsset(input);
      set((s) => ({ items: [...s.items, created] }));
    } catch (err) {
      console.error("[assetsStore] add failed:", err);
    }
  },

  async update(id, updates) {
    try {
      await updateAsset(id, updates);
      // Re-load from DB to ensure state matches the persisted row.
      await get().load();
    } catch (err) {
      console.error("[assetsStore] update failed:", err);
    }
  },

  async remove(id) {
    try {
      await deleteAsset(id);
      set((s) => ({ items: s.items.filter((item) => item.id !== id) }));
    } catch (err) {
      console.error("[assetsStore] remove failed:", err);
    }
  },
}));
