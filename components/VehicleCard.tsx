"use client";

import type { Vehicle } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { ExternalLink } from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysOnLot(firstSeen: string): number {
  const first = new Date(firstSeen);
  const now = new Date();
  return Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
}

export function VehicleCard({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: (vin: string) => void;
}) {
  const packages: string[] = (() => {
    try {
      return JSON.parse(vehicle.packages || "[]");
    } catch {
      return [];
    }
  })();

  const days = daysOnLot(vehicle.first_seen);

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        selected
          ? "border-bmw-blue bg-bmw-blue/5"
          : "border-bmw-border bg-bmw-card hover:border-bmw-border/80"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(vehicle.vin)}
            className="h-4 w-4 rounded border-bmw-border bg-bmw-card accent-bmw-blue"
          />
          <div>
            <h3 className="font-semibold">
              {vehicle.year} {vehicle.trim}
            </h3>
            <p className="text-sm text-bmw-muted">{vehicle.vin}</p>
          </div>
        </div>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-bmw-muted">Exterior: </span>
          {vehicle.exterior_color}
        </div>
        <div>
          <span className="text-bmw-muted">Interior: </span>
          {vehicle.interior_color}
        </div>
        <div>
          <span className="text-bmw-muted">Dealer: </span>
          {vehicle.dealer_name}
        </div>
        <div>
          <span className="text-bmw-muted">City: </span>
          {vehicle.dealer_city}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {packages.map((pkg) => (
          <span
            key={pkg}
            className="rounded-full bg-bmw-border/50 px-2 py-0.5 text-xs text-bmw-muted"
          >
            {pkg}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold">
            {formatCurrency(vehicle.msrp)}
          </span>
          {days > 0 && (
            <span className="ml-2 text-xs text-bmw-muted">
              {days}d on lot
            </span>
          )}
        </div>
        {vehicle.detail_url && (
          <a
            href={vehicle.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-bmw-blue hover:underline"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
