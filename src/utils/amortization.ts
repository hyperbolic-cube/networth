export function applyAmortization(
  principal: number,
  annualRatePercent: number,
  monthlyPayment: number,
): number {
  if (principal <= 0) return 0;
  if (annualRatePercent < 0) throw new Error(`annualRatePercent must be >= 0, got ${annualRatePercent}`);
  if (monthlyPayment <= 0) return principal;

  const interestPortion = principal * (annualRatePercent / 12 / 100);
  const newPrincipal = principal - (monthlyPayment - interestPortion);
  return Math.max(0, newPrincipal);
}
