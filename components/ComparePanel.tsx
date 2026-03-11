"use client";

import type { Vehicle } from "@/lib/types";
import { formatCurrency, daysOnLot } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { X } from "lucide-react";

function PriceCell({
  msrp,
  allPrices,
}: {
  msrp: number;
  allPrices: number[];
}) {
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const isCheapest = msrp === min && min !== max;
  const isMostExpensive = msrp === max && min !== max;

  return (
    <span
      className={`font-semibold tabular-nums ${
        isCheapest
          ? "text-emerald-400"
          : isMostExpensive
          ? "text-red-400"
          : ""
      }`}
    >
      {formatCurrency(msrp)}
    </span>
  );
}

function ScoreCell({
  score,
  allScores,
}: {
  score: number;
  allScores: number[];
}) {
  const max = Math.max(...allScores);
  const isBest = score === max && new Set(allScores).size > 1;

  return (
    <span
      className={`font-semibold tabular-nums ${isBest ? "text-emerald-400" : ""}`}
    >
      {score}
    </span>
  );
}

export function ComparePanel({
  vehicles,
  onClose,
  onRemove,
}: {
  vehicles: Vehicle[];
  onClose: () => void;
  onRemove: (vin: string) => void;
}) {
  if (vehicles.length === 0) return null;

  const allPrices = vehicles.map((v) => v.msrp);
  const allScores = vehicles.map((v) => v.quality_score);

  const rows: {
    label: string;
    render: (v: Vehicle, i: number) => React.ReactNode;
  }[] = [
    {
      label: "Score",
      render: (v) => <ScoreCell score={v.quality_score} allScores={allScores} />,
    },
    { label: "Make", render: (v) => v.make },
    { label: "Year", render: (v) => v.year },
    { label: "Trim", render: (v) => v.trim },
    {
      label: "MSRP",
      render: (v) => <PriceCell msrp={v.msrp} allPrices={allPrices} />,
    },
    { label: "Exterior", render: (v) => v.exterior_color },
    { label: "Interior", render: (v) => v.interior_color },
    {
      label: "Status",
      render: (v) => <StatusBadge status={v.status} />,
    },
    { label: "Dealer", render: (v) => v.dealer_name },
    { label: "City", render: (v) => v.dealer_city },
    {
      label: "Days on Lot",
      render: (v) => {
        const days = daysOnLot(v.first_seen);
        return days > 0 ? `${days} days` : "Today";
      },
    },
    {
      label: "Stock #",
      render: (v) => v.stock_number || "-",
    },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-bmw-border bg-bmw-dark/98 backdrop-blur-md shadow-2xl">
      <div className="mx-auto max-w-7xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-bmw-muted">
            Compare ({vehicles.length})
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-bmw-muted hover:bg-bmw-border hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pr-4 py-1.5 text-left text-xs font-medium text-bmw-muted w-28" />
                {vehicles.map((v) => (
                  <th
                    key={v.vin}
                    className="px-4 py-1.5 text-left min-w-[200px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {v.year} {v.make} {v.trim}
                      </span>
                      <button
                        onClick={() => onRemove(v.vin)}
                        className="ml-2 rounded p-0.5 text-bmw-muted hover:text-red-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-[10px] text-bmw-muted font-normal">
                      {v.vin}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bmw-border/50">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="pr-4 py-2 text-xs font-medium text-bmw-muted">
                    {row.label}
                  </td>
                  {vehicles.map((v, i) => (
                    <td key={v.vin} className="px-4 py-2">
                      {row.render(v, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
