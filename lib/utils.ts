export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function daysOnLot(firstSeen: string): number {
  const first = new Date(firstSeen);
  const now = new Date();
  return Math.floor(
    (now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)
  );
}
