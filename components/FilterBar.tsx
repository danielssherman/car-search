"use client";

import type { DealerInfo } from "@/lib/types";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  filters: {
    make: string;
    model: string;
    dealer: string;
    color: string;
    status: string;
    minPrice: string;
    maxPrice: string;
    sort: string;
    search: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  dealers: DealerInfo[];
  colors: string[];
  makes: string[];
  models: string[];
  activeFilterCount: number;
}

export function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  dealers,
  colors,
  makes,
  models,
  activeFilterCount,
}: FilterBarProps) {
  const selectClass =
    "rounded-md border border-bmw-border bg-bmw-card px-3 py-2 text-sm text-white outline-none focus:border-bmw-blue focus:ring-1 focus:ring-bmw-blue";

  return (
    <div className="sticky top-0 z-10 border-b border-bmw-border bg-bmw-dark/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bmw-muted" />
          <input
            type="text"
            placeholder="Search VIN, make, model, color, dealer..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="w-full rounded-md border border-bmw-border bg-bmw-card py-2 pl-9 pr-3 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue focus:ring-1 focus:ring-bmw-blue"
          />
        </div>

        {/* Make */}
        <select
          value={filters.make}
          onChange={(e) => onFilterChange("make", e.target.value)}
          className={selectClass}
        >
          <option value="all">All Makes</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Model */}
        <select
          value={filters.model}
          onChange={(e) => onFilterChange("model", e.target.value)}
          className={selectClass}
        >
          <option value="all">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Dealer */}
        <select
          value={filters.dealer}
          onChange={(e) => onFilterChange("dealer", e.target.value)}
          className={selectClass}
        >
          <option value="">All Dealers</option>
          {dealers.map((d) => (
            <option key={d.dealer_name} value={d.dealer_name}>
              {d.dealer_name} ({d.vehicle_count})
            </option>
          ))}
        </select>

        {/* Color */}
        <select
          value={filters.color}
          onChange={(e) => onFilterChange("color", e.target.value)}
          className={selectClass}
        >
          <option value="">All Colors</option>
          {colors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => onFilterChange("status", e.target.value)}
          className={selectClass}
        >
          <option value="all">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="in_transit">In Transit</option>
        </select>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onFilterChange("sort", e.target.value)}
          className={selectClass}
        >
          <option value="best_value">Best Value</option>
          <option value="newest">Newest First</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>

        {/* Price Range */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min $"
            value={filters.minPrice}
            onChange={(e) => onFilterChange("minPrice", e.target.value)}
            className="w-24 rounded-md border border-bmw-border bg-bmw-card px-3 py-2 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue"
          />
          <span className="text-bmw-muted">-</span>
          <input
            type="number"
            placeholder="Max $"
            value={filters.maxPrice}
            onChange={(e) => onFilterChange("maxPrice", e.target.value)}
            className="w-24 rounded-md border border-bmw-border bg-bmw-card px-3 py-2 text-sm text-white placeholder-bmw-muted outline-none focus:border-bmw-blue"
          />
        </div>

        {/* Active filter badge + clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1.5 rounded-md border border-bmw-border bg-bmw-card px-3 py-2 text-sm text-bmw-muted hover:border-red-500/50 hover:text-red-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
}
