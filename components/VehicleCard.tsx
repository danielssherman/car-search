"use client";

import type { Vehicle } from "@/lib/types";
import { formatCurrency, daysOnLot } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { ExternalLink } from "lucide-react";

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

export function VehicleCard({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: (vin: string) => void;
}) {
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
              {vehicle.year} {vehicle.make} {vehicle.model !== vehicle.trim ? `${vehicle.model} ${vehicle.trim}` : vehicle.trim}
              {vehicle.listing_count > 1 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-bmw-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-bmw-blue">
                  {vehicle.listing_count} listings
                </span>
              )}
            </h3>
            <p className="text-sm text-bmw-muted">{vehicle.vin}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={vehicle.quality_score} />
          <StatusBadge status={vehicle.status} />
        </div>
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

      <div className="mt-3 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold">
            {formatCurrency(vehicle.price)}
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
