"use client";

import type { InventoryStats } from "@/lib/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-bmw-border bg-bmw-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-bmw-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {subtext && (
        <p className="mt-0.5 text-xs text-bmw-muted">{subtext}</p>
      )}
    </div>
  );
}

export function StatsBar({
  stats,
  loading,
}: {
  stats: (InventoryStats & { last_scraped: string | null }) | null;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-bmw-border bg-bmw-card"
          />
        ))}
      </div>
    );
  }

  // Top 3 makes for display
  const topMakes = Object.entries(stats.count_by_make)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const topMakesStr = topMakes.map(([make, count]) => `${make} (${count})`).join(", ");

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard label="Total Vehicles" value={stats.total} />
      <StatCard label="Dealers" value={stats.total_dealers} />
      <StatCard
        label="Top Makes"
        value={topMakes[0]?.[0] || "-"}
        subtext={topMakesStr}
      />
      <StatCard
        label="Avg Price"
        value={formatCurrency(stats.avg_msrp)}
      />
      <StatCard
        label="Price Range"
        value={`${formatCurrency(stats.min_msrp)} - ${formatCurrency(
          stats.max_msrp
        )}`}
      />
    </div>
  );
}
