export function applyAmortization(
  principal: number,
  annualRatePercent: number,
  monthlyPayment: number,
): number {
  // Defensive: any non-finite input collapses to the safe identity (no change).
  // Historically `annualRatePercent < 0` threw — that crash bubbled out of the
  // lock flow when an older row had been saved with a malformed rate. Returning
  // `principal` keeps the lock from failing on bad data.
  if (!Number.isFinite(principal)) return 0;
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) return principal;
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) return principal;
  if (principal <= 0) return 0;

  const interestPortion = principal * (annualRatePercent / 12 / 100);
  const newPrincipal = principal - (monthlyPayment - interestPortion);
  return Math.max(0, newPrincipal);
}
