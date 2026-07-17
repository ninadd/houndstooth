export function formatCurrency(value: number, opts?: { cents?: boolean }): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  const magnitude = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${sign}${magnitude}%`;
}
