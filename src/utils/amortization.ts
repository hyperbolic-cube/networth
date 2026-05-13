// TODO Phase 6: add input validation (principal <= 0, rate < 0, payment <= 0)
// and unit tests (normal cycle, final-payment clamp, interest-only, zero-rate,
// already-paid). Formula below is PRD-spec correct; edge-case clamping is Phase 6.
export function applyAmortization(
  principal: number,
  annualRatePercent: number,
  monthlyPayment: number,
): number {
  const interestPortion = principal * (annualRatePercent / 12 / 100);
  const newPrincipal = principal - (monthlyPayment - interestPortion);
  return Math.max(0, newPrincipal);
}
