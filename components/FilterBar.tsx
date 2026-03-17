"use client";

import { useState, useRef, useEffect } from "react";
import type { DealerInfo } from "@/lib/types";
import { Search, X, Sparkles, Loader2 } from "lucide-react";
import {
  MultiSelectPopover,
  SingleSelectPopover,
  PriceRangePopover,
} from "./FilterChip";
import type { FilterOption } from "./FilterChip";

interface FilterBarFilters {
  make: string;
  models: string[];
  dealers: string[];
  colors: string[];
  conditions: string[];
  status: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  search: string;
}

interface FilterBarProps {
  filters: FilterBarFilters;
  onFilterChange: (key: string, value: string) => void;
  onMultiFilterChange: (key: string, values: string[]) => void;
  onClearFilters: () => void;
  dealers: DealerInfo[];
  makes: string[];
  modelCounts: Record<string, number>;
  colorCounts: Record<string, number>;
  conditionCounts: Record<string, number>;
  activeFilterCount: number;
  aiSearchActive: boolean;
  onToggleAiSearch: () => void;
  onAiSearchSubmit: (query: string) => void;
  aiSearchLoading: boolean;
}

export function FilterBar({
  filters,
  onFilterChange,
  onMultiFilterChange,
  onClearFilters,
  dealers,
  makes,
  modelCounts,
  colorCounts,
  conditionCounts,
  activeFilterCount,
  aiSearchActive,
  onToggleAiSearch,
  onAiSearchSubmit,
  aiSearchLoading,
}: FilterBarProps) {
  const [aiQuery, setAiQuery] = useState("");
  const aiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aiSearchActive && aiInputRef.current) {
      aiInputRef.current.focus();
    }
  }, [aiSearchActive]);

  const handleAiSubmit = () => {
    const trimmed = aiQuery.trim();
    if (trimmed) {
      onAiSearchSubmit(trimmed);
    }
  };

  // Build option lists with counts
  const makeOptions: FilterOption[] = makes.map((m) => ({ value: m }));

  const modelOptions: FilterOption[] = Object.entries(modelCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([model, count]) => ({ value: model, count }));

  const dealerOptions: FilterOption[] = dealers.map((d) => ({
    value: d.dealer_name,
    count: d.vehicle_count,
  }));

  const colorOptions: FilterOption[] = Object.entries(colorCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([color, count]) => ({ value: color, count }));

  const conditionOptions: FilterOption[] = Object.entries(conditionCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([condition, count]) => ({ value: condition, count }));

  const statusOptions: FilterOption[] = [
    { value: "all" },
    { value: "In Stock" },
    { value: "In Transit" },
  ];

  // Map display values to API values
  const statusToApi: Record<string, string> = {
    "all": "all",
    "In Stock": "in_stock",
    "In Transit": "in_transit",
  };
  const statusFromApi: Record<string, string> = {
    "all": "all",
    "in_stock": "In Stock",
    "in_transit": "In Transit",
  };

  const selectClass =
    "rounded-md border border-bmw-border bg-bmw-card px-3 py-1.5 text-sm text-white outline-none focus:border-bmw-blue focus:ring-1 focus:ring-bmw-blue";

  return (
    <div className="sticky top-0 z-10 border-b border-bmw-border bg-bmw-dark/95 backdrop-blur-sm">
      {/* Row 1: Search bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="relative flex-1 min-w-[200px]">
          {aiSearchActive ? (
            <>
              <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-400" />
              <input
                ref={aiInputRef}
                type="text"
                placeholder="Describe what you're looking for..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !aiSearchLoading) handleAiSubmit();
                }}
                disabled={aiSearchLoading}
                className="w-full rounded-md border border-purple-500/50 bg-bmw-card py-2 pl-9 pr-20 text-sm text-white placeholder-bmw-muted outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.15)]"
              />
              {aiSearchLoading ? (
                <Loader2 className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-400 animate-spin" />
              ) : (
                aiQuery.trim() && (
                  <button
                    onClick={handleAiSubmit}
                    className="absolute right-12 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
                  >
                    Go
                  </button>
                )
              )}
            </>
          ) : (
            <>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bmw-muted" />
              <input
                type="text"
                placeholder="Search VIN, make, model, color, dealer..."
                value={filters.search}
                onChange={(e) => onFilterChange("search", e.target.value)}
                className="w-full rounded-md border border-bmw-border bg-bmw-card py-2 pl-9 pr-12 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue focus:ring-1 focus:ring-bmw-blue"
              />
            </>
          )}
          {/* AI toggle button */}
          <button
            onClick={onToggleAiSearch}
            title={aiSearchActive ? "Switch to regular search" : "Switch to AI search"}
            className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors ${
              aiSearchActive
                ? "text-purple-400 bg-purple-500/20 hover:bg-purple-500/30"
                : "text-bmw-muted hover:text-purple-400 hover:bg-purple-500/10"
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Row 2: Filter chips — hidden when AI search is active */}
      {!aiSearchActive && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {/* Make — single select */}
          {makes.length > 1 && (
            <SingleSelectPopover
              label="Make"
              options={makeOptions}
              selected={filters.make}
              defaultValue="all"
              onChange={(v) => onFilterChange("make", v)}
            />
          )}

          {/* Model — multi-select with search */}
          <MultiSelectPopover
            label="Model"
            options={modelOptions}
            selected={filters.models}
            onChange={(v) => onMultiFilterChange("models", v)}
            searchable
          />

          {/* Dealer — multi-select */}
          <MultiSelectPopover
            label="Dealer"
            options={dealerOptions}
            selected={filters.dealers}
            onChange={(v) => onMultiFilterChange("dealers", v)}
          />

          {/* Color — multi-select with search */}
          <MultiSelectPopover
            label="Color"
            options={colorOptions}
            selected={filters.colors}
            onChange={(v) => onMultiFilterChange("colors", v)}
            searchable
          />

          {/* Condition — multi-select */}
          {conditionOptions.length > 0 && (
            <MultiSelectPopover
              label="Condition"
              options={conditionOptions}
              selected={filters.conditions}
              onChange={(v) => onMultiFilterChange("conditions", v)}
            />
          )}

          {/* Status — single select */}
          <SingleSelectPopover
            label="Status"
            options={statusOptions}
            selected={statusFromApi[filters.status] || "all"}
            defaultValue="all"
            onChange={(v) => onFilterChange("status", statusToApi[v] || "all")}
          />

          {/* Price range */}
          <PriceRangePopover
            minPrice={filters.minPrice}
            maxPrice={filters.maxPrice}
            onMinChange={(v) => onFilterChange("minPrice", v)}
            onMaxChange={(v) => onFilterChange("maxPrice", v)}
            onClear={() => {
              onFilterChange("minPrice", "");
              onFilterChange("maxPrice", "");
            }}
          />

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1.5 rounded-full border border-bmw-border px-3 py-1.5 text-sm text-bmw-muted hover:border-red-500/50 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear all ({activeFilterCount})
            </button>
          )}

          {/* Sort — native select, right-aligned */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-bmw-muted">Sort:</span>
            <select
              value={filters.sort}
              onChange={(e) => onFilterChange("sort", e.target.value)}
              className={selectClass}
            >
              <option value="best_value">Best Value</option>
              <option value="newest">Newest First</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
