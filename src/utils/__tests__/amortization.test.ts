import { applyAmortization } from "../amortization";

describe("applyAmortization", () => {
  describe("math cases", () => {
    it("normal amortization cycle reduces principal by (payment - interest)", () => {
      // interest = 100000 × (12/12/100) = 1000; reduction = 500; new = 99500
      expect(applyAmortization(100000, 12, 1500)).toBe(99500);
    });

    it("final payment clamps to zero when payment exceeds remaining balance", () => {
      // interest = 1000 × 0.01 = 10; naive = 1000 - 1490 = -490 → clamp to 0
      expect(applyAmortization(1000, 12, 1500)).toBe(0);
    });

    it("interest-only payment leaves principal unchanged", () => {
      // interest = 100000 × 0.01 = 1000; reduction = 0
      expect(applyAmortization(100000, 12, 1000)).toBe(100000);
    });

    it("zero interest rate: full payment reduces principal", () => {
      // interest = 0; reduction = 200; new = 9800
      expect(applyAmortization(10000, 0, 200)).toBe(9800);
    });

    it("already paid-off principal (= 0) returns 0 immediately", () => {
      expect(applyAmortization(0, 12, 1000)).toBe(0);
    });
  });

  describe("validation", () => {
    it("principal = 0 returns 0", () => {
      expect(applyAmortization(0, 12, 500)).toBe(0);
    });

    it("negative principal returns 0", () => {
      expect(applyAmortization(-100, 12, 500)).toBe(0);
    });

    it("negative rate throws Error", () => {
      expect(() => applyAmortization(100000, -5, 500)).toThrow();
    });

    it("zero payment is a payment holiday — returns principal unchanged", () => {
      expect(applyAmortization(100000, 12, 0)).toBe(100000);
    });

    it("negative payment is treated as payment holiday", () => {
      expect(applyAmortization(100000, 12, -100)).toBe(100000);
    });

    it("high rate (200% annual) is accepted — loan grows when payment < monthly interest", () => {
      // interest = 100000 × (200/12/100) = 16666.67; payment 2000 < interest → grows
      // new = 100000 - (2000 - 16666.67) = 114666.67
      expect(applyAmortization(100000, 200, 2000)).toBeCloseTo(114666.67, 2);
    });
  });

  describe("integration with autofill/lock call sites", () => {
    it("does not throw on realistic mortgage inputs", () => {
      // KZT mortgage: 50M principal, 12% annual, 200K monthly payment
      expect(() => applyAmortization(50_000_000, 12, 200_000)).not.toThrow();
      // USD mortgage: 99500 principal, 5.5% annual, 800 monthly payment
      expect(() => applyAmortization(99500, 5.5, 800)).not.toThrow();
    });

    it("returns 0 for paid-off loan (autofill prev=0 case)", () => {
      // autofill.ts passes prevItem.value_in_original_currency which is 0 when fully paid
      expect(applyAmortization(0, 12, 500)).toBe(0);
    });
  });
});
