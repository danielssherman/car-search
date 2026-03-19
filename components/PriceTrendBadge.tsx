"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PriceTrendBadgeProps {
  trend: "up" | "down" | "stable" | null;
  amount?: number | null;
  size?: "compact" | "full";
}

export function PriceTrendBadge({
  trend,
  amount,
  size = "compact",
}: PriceTrendBadgeProps) {
  if (!trend || trend === "stable") return null;

  const isDown = trend === "down";
  const Icon = isDown ? TrendingDown : TrendingUp;
  const color = isDown
    ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
    : "text-red-400 bg-red-500/10 ring-red-500/20";

  const label = amount
    ? `${isDown ? "Down" : "Up"} ${formatCurrency(amount)}`
    : isDown
      ? "Price dropped"
      : "Price increased";

  if (size === "compact") {
    return (
      <span
        className={`inline-flex items-center rounded-full ring-1 p-0.5 ${color}`}
        title={label}
      >
        <Icon className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
