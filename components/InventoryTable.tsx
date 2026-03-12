"use client";

import { useState } from "react";
import type { Vehicle } from "@/lib/types";
import { formatCurrency, daysOnLot } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { VehicleCard } from "./VehicleCard";
import { ExternalLink, ArrowUpDown } from "lucide-react";

type SortKey =
  | "make"
  | "trim"
  | "year"
  | "exterior_color"
  | "interior_color"
  | "price"
  | "dealer_name"
  | "dealer_city"
  | "status"
  | "quality_score";

function ScoreBadge({ score }: { score: number }) {
  let color = "text-bmw-muted bg-bmw-border/50";
  if (score >= 75) color = "text-emerald-400 bg-emerald-500/10";
  else if (score >= 55) color = "text-bmw-blue bg-bmw-blue/10";
  else if (score < 40) color = "text-red-400 bg-red-500/10";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${color}`}
    >
      {score}
    </span>
  );
}

function ListingCountBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-bmw-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-bmw-blue">
      {count} listings
    </span>
  );
}

export function InventoryTable({
  vehicles,
  loading,
  selectedVins,
  onToggleSelect,
}: {
  vehicles: Vehicle[];
  loading: boolean;
  selectedVins: Set<string>;
  onToggleSelect: (vin: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...vehicles].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDir === "asc" ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal || "");
        const bStr = String(bVal || "");
        return sortDir === "asc"
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      })
    : vehicles;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg border border-bmw-border bg-bmw-card"
          />
        ))}
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-bmw-border bg-bmw-card py-16">
        <p className="text-lg font-medium text-bmw-muted">No vehicles found</p>
        <p className="mt-1 text-sm text-bmw-muted/60">
          Try adjusting your filters or run a new scrape
        </p>
      </div>
    );
  }

  const SortHeader = ({
    label,
    column,
    className,
  }: {
    label: string;
    column: SortKey;
    className?: string;
  }) => (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-bmw-muted hover:text-white transition-colors ${className || ""}`}
      onClick={() => handleSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${
            sortKey === column ? "text-bmw-blue" : "text-bmw-muted/40"
          }`}
        />
      </span>
    </th>
  );

  return (
    <>
      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {sorted.map((vehicle) => (
          <VehicleCard
            key={vehicle.vin}
            vehicle={vehicle}
            selected={selectedVins.has(vehicle.vin)}
            onSelect={onToggleSelect}
          />
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-bmw-border">
        <table className="w-full text-sm">
          <thead className="border-b border-bmw-border bg-bmw-card">
            <tr>
              <th className="px-4 py-3 w-10">
                <span className="sr-only">Select</span>
              </th>
              <SortHeader label="Score" column="quality_score" className="w-16" />
              <SortHeader label="Make" column="make" />
              <SortHeader label="Model / Trim" column="trim" />
              <SortHeader label="Year" column="year" className="w-16" />
              <SortHeader label="Ext Color" column="exterior_color" />
              <SortHeader label="Price" column="price" />
              <SortHeader label="Dealer" column="dealer_name" />
              <SortHeader label="City" column="dealer_city" />
              <SortHeader label="Status" column="status" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-bmw-muted">
                Link
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bmw-border">
            {sorted.map((vehicle, index) => {
              const days = daysOnLot(vehicle.first_seen);

              return (
                <tr
                  key={vehicle.vin}
                  className={`transition-colors hover:bg-white/[0.02] ${
                    index % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                  } ${
                    selectedVins.has(vehicle.vin)
                      ? "!bg-bmw-blue/5 ring-1 ring-inset ring-bmw-blue/20"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedVins.has(vehicle.vin)}
                      onChange={() => onToggleSelect(vehicle.vin)}
                      className="h-4 w-4 rounded border-bmw-border bg-bmw-card accent-bmw-blue"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={vehicle.quality_score} />
                  </td>
                  <td className="px-4 py-3 font-medium">{vehicle.make}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {vehicle.trim}
                      <ListingCountBadge count={vehicle.listing_count} />
                    </div>
                    <div className="text-xs text-bmw-muted">
                      {vehicle.vin}
                      {days > 0 && (
                        <span className="ml-1 text-bmw-muted/60">
                          ({days}d)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{vehicle.year}</td>
                  <td className="px-4 py-3">{vehicle.exterior_color}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {formatCurrency(vehicle.price)}
                  </td>
                  <td className="px-4 py-3 text-sm">{vehicle.dealer_name}</td>
                  <td className="px-4 py-3 text-sm">{vehicle.dealer_city}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={vehicle.status} />
                  </td>
                  <td className="px-4 py-3">
                    {vehicle.detail_url && (
                      <a
                        href={vehicle.detail_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bmw-blue hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
