import { create } from "zustand";
import {
  advanceMockDate as clockAdvance,
  getMockDate,
  getNow,
  setMockDate as clockSet,
} from "../utils/clock";

interface ClockState {
  mockDate: Date | null;
  setMockDate: (date: Date | null) => void;
  advanceMockDate: (deltaMs: number) => void;
  advanceMockMonth: () => void;
}

export const useClockStore = create<ClockState>((set) => ({
  mockDate: null,

  setMockDate(date) {
    clockSet(date);
    set({ mockDate: date });
  },

  advanceMockDate(deltaMs) {
    clockAdvance(deltaMs);
    set({ mockDate: getMockDate() });
  },

  advanceMockMonth() {
    const d = getNow();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    clockSet(next);
    set({ mockDate: next });
  },
}));
