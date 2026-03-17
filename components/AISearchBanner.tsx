"use client";

import type { InventoryFilters } from "@/lib/types";
import { Sparkles, X } from "lucide-react";

interface AISearchBannerProps {
  query: string;
  explanation: string;
  filters: InventoryFilters;
  onDismiss: () => void;
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-medium text-purple-300 border border-purple-500/20">
      {label}
    </span>
  );
}

export function AISearchBanner({
  query,
  explanation,
  filters,
  onDismiss,
}: AISearchBannerProps) {
  const chips: string[] = [];
  if (filters.models && filters.models.length > 0)
    chips.push(`Models: ${filters.models.join(", ")}`);
  else if (filters.model) chips.push(`Model: ${filters.model}`);
  if (filters.color) chips.push(`Color: ${filters.color}`);
  if (filters.condition) chips.push(`Condition: ${filters.condition}`);
  if (filters.minPrice) chips.push(`Min: $${filters.minPrice.toLocaleString()}`);
  if (filters.maxPrice) chips.push(`Max: $${filters.maxPrice.toLocaleString()}`);
  if (filters.dealer) chips.push(`Dealer: ${filters.dealer}`);
  if (filters.search) chips.push(`Trim: ${filters.search}`);
  if (filters.sort && filters.sort !== "best_value")
    chips.push(`Sort: ${filters.sort.replace("_", " ")}`);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <div className="relative rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300">
              <span className="text-bmw-muted">&ldquo;{query}&rdquo;</span>
              {" — "}
              {explanation}
            </p>
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <FilterChip key={chip} label={chip} />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="flex-shrink-0 rounded-md p-1 text-bmw-muted hover:text-white hover:bg-white/10 transition-colors"
            title="Clear AI search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AISearchLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-purple-500/10" />
            <div className="flex gap-1.5">
              <div className="h-5 w-20 animate-pulse rounded-full bg-purple-500/10" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-purple-500/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
