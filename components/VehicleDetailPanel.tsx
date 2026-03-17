"use client";

import { useEffect, useState, useCallback } from "react";
import type { Vehicle, Listing } from "@/lib/types";
import { formatCurrency, daysOnLot } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { X, ExternalLink, Package } from "lucide-react";

interface VehicleDetailPanelProps {
  vin: string;
  onClose: () => void;
}

type VehicleDetail = Vehicle & { listings: Listing[] };

function ScoreBadge({ score }: { score: number }) {
  let color = "text-bmw-muted bg-bmw-border/50";
  if (score >= 75) color = "text-emerald-400 bg-emerald-500/10";
  else if (score >= 55) color = "text-bmw-blue bg-bmw-blue/10";
  else if (score < 40) color = "text-red-400 bg-red-500/10";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${color}`}
    >
      {score}
    </span>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-bmw-border/50 ${className}`}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <SkeletonLine className="h-7 w-3/4" />
        <SkeletonLine className="h-4 w-1/3" />
      </div>

      {/* Price skeleton */}
      <div className="space-y-2 rounded-lg border border-bmw-border bg-bmw-dark p-4">
        <SkeletonLine className="h-8 w-1/3" />
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-4 w-1/4" />
      </div>

      {/* Specs grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <SkeletonLine className="h-3 w-16" />
            <SkeletonLine className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Packages skeleton */}
      <div className="space-y-2">
        <SkeletonLine className="h-4 w-20" />
        <div className="flex flex-wrap gap-2">
          <SkeletonLine className="h-6 w-32" />
          <SkeletonLine className="h-6 w-24" />
          <SkeletonLine className="h-6 w-28" />
        </div>
      </div>
    </div>
  );
}

export function VehicleDetailPanel({ vin, onClose }: VehicleDetailPanelProps) {
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Fetch vehicle data
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/inventory/${vin}`)
      .then((res) => {
        if (!res.ok) throw new Error("Vehicle not found");
        return res.json();
      })
      .then((data: VehicleDetail) => {
        setVehicle(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load vehicle");
        setLoading(false);
      });
  }, [vin]);

  const days = vehicle ? daysOnLot(vehicle.first_seen) : 0;

  let packages: string[] = [];
  if (vehicle?.packages) {
    try {
      const parsed = JSON.parse(vehicle.packages);
      if (Array.isArray(parsed)) packages = parsed;
    } catch {
      // Not valid JSON — ignore
    }
  }

  const cheapestPrice = vehicle?.listings?.length
    ? Math.min(...vehicle.listings.map((l) => l.price))
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-bmw-border bg-bmw-card shadow-2xl animate-slide-in-right">
        {/* Close button — always visible */}
        <div className="flex items-center justify-between border-b border-bmw-border px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-bmw-muted">
            Vehicle Details
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-bmw-muted hover:bg-bmw-border hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading && <LoadingSkeleton />}

          {error && (
            <div className="p-6">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                {error}
              </div>
            </div>
          )}

          {vehicle && !loading && (
            <div className="space-y-6 p-6">
              {/* 1. Header */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold leading-tight">
                    {vehicle.year} {vehicle.make}{" "}
                    {vehicle.model !== vehicle.trim
                      ? `${vehicle.model} ${vehicle.trim}`
                      : vehicle.trim}
                  </h3>
                  <ScoreBadge score={vehicle.quality_score} />
                </div>
                <p className="mt-1 text-sm text-bmw-muted font-mono">
                  {vehicle.vin}
                </p>
              </div>

              {/* 2. Price section */}
              <div className="rounded-lg border border-bmw-border bg-bmw-dark p-4 space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(vehicle.price)}
                  </span>
                  {vehicle.msrp > 0 && vehicle.msrp !== vehicle.price && (
                    <span className="text-sm text-bmw-muted line-through tabular-nums">
                      {formatCurrency(vehicle.msrp)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>{vehicle.dealer_name}</span>
                  <span className="text-bmw-muted">&middot;</span>
                  <span className="text-bmw-muted">{vehicle.dealer_city}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={vehicle.status} />
                  {vehicle.stock_number && (
                    <span className="text-xs text-bmw-muted">
                      Stock #{vehicle.stock_number}
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Specs grid */}
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
                  Specifications
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <SpecRow label="VIN" value={vehicle.vin} mono />
                  <SpecRow label="Exterior Color" value={vehicle.exterior_color} />
                  <SpecRow label="Interior Color" value={vehicle.interior_color} />
                  <SpecRow
                    label="Mileage"
                    value={
                      vehicle.mileage > 0
                        ? vehicle.mileage.toLocaleString() + " mi"
                        : "N/A"
                    }
                  />
                  <SpecRow label="Condition" value={vehicle.condition} />
                  <SpecRow label="Drivetrain" value={vehicle.drivetrain} />
                  <SpecRow label="Engine" value={vehicle.engine} />
                  <SpecRow label="Fuel Type" value={vehicle.fuel_type} />
                  <SpecRow label="Body Style" value={vehicle.body_style} />
                  <SpecRow
                    label="Days on Lot"
                    value={days > 0 ? `${days} days` : "Today"}
                  />
                </div>
              </div>

              {/* 4. Packages */}
              {packages.length > 0 && (
                <div>
                  <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
                    <Package className="h-3.5 w-3.5" />
                    Packages
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {packages.map((pkg) => (
                      <span
                        key={pkg}
                        className="inline-flex items-center rounded-full bg-bmw-blue/10 px-3 py-1 text-xs font-medium text-bmw-blue ring-1 ring-bmw-blue/20"
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. All Listings table */}
              {vehicle.listings && vehicle.listings.length > 1 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
                    All Listings ({vehicle.listings.length})
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-bmw-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-bmw-border bg-bmw-dark/50">
                          <th className="px-3 py-2 text-left text-xs font-medium text-bmw-muted">
                            Dealer
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-bmw-muted">
                            Price
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-bmw-muted">
                            Status
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-bmw-muted">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bmw-border/50">
                        {vehicle.listings.map((listing) => (
                          <tr
                            key={listing.id}
                            className={
                              listing.price === cheapestPrice
                                ? "bg-emerald-500/5"
                                : ""
                            }
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium">
                                {listing.dealer_name}
                              </div>
                              <div className="text-xs text-bmw-muted">
                                {listing.dealer_city}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span
                                className={
                                  listing.price === cheapestPrice
                                    ? "font-semibold text-emerald-400"
                                    : ""
                                }
                              >
                                {formatCurrency(listing.price)}
                              </span>
                              {listing.price === cheapestPrice && (
                                <div className="text-[10px] text-emerald-400">
                                  Lowest
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={listing.status} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {listing.detail_url && (
                                <a
                                  href={listing.detail_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-bmw-blue hover:underline"
                                  aria-label={`View listing at ${listing.dealer_name}`}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 6. External link button */}
              {vehicle.detail_url && (
                <a
                  href={vehicle.detail_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-bmw-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-bmw-blue/90"
                >
                  View on Dealer Site
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SpecRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-bmw-muted">{label}</div>
      <div
        className={`truncate ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value || "-"}
      </div>
    </div>
  );
}
