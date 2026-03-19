"use client";

import { useEffect, useState } from "react";
import type { PriceHistoryResponse } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface PriceHistorySectionProps {
  vin: string;
  currentPrice: number;
}

export function PriceHistorySection({
  vin,
  currentPrice,
}: PriceHistorySectionProps) {
  const [data, setData] = useState<PriceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/price-history/${vin}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((json: PriceHistoryResponse) => {
        // Client-side dedup: collapse entries with same price + timestamp
        const seen = new Set<string>();
        json.history = json.history.filter((h) => {
          const key = `${h.price}|${h.recorded_at}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Recompute summary after dedup
        if (json.history.length > 0) {
          const prices = json.history.map((h) => h.price);
          const uniquePrices = new Set(prices).size;
          json.summary = {
            has_changes: uniquePrices > 1,
            change_count: json.history.filter((h, i) => i > 0 && h.price !== json.history[i - 1].price).length,
            first_price: json.history[0].price,
            latest_price: json.history[json.history.length - 1].price,
            min_price: Math.min(...prices),
            max_price: Math.max(...prices),
            total_change: json.history[json.history.length - 1].price - json.history[0].price,
            first_recorded: json.history[0].recorded_at,
            latest_recorded: json.history[json.history.length - 1].recorded_at,
          };
        }
        json.total = json.history.length;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [vin]);

  if (loading) {
    return (
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
          Price History
        </h4>
        <div className="animate-pulse rounded-lg bg-bmw-border/30" style={{ height: "120px" }} />
      </div>
    );
  }

  if (!data || data.total === 0) return null;

  const { summary, history } = data;
  const hasChanges = summary?.has_changes ?? false;

  // Stable price — compact text display
  if (!hasChanges) {
    const firstDate = new Date(history[0].recorded_at).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" }
    );
    return (
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
          Price History
        </h4>
        <div className="flex items-center gap-2 text-sm text-bmw-muted">
          <Minus className="h-3.5 w-3.5" />
          <span>
            Price stable at {formatCurrency(currentPrice)} since {firstDate}
          </span>
        </div>
      </div>
    );
  }

  // Has price changes — show chart + summary
  const totalChange = summary!.total_change;
  const isDown = totalChange < 0;
  const isNet0 = totalChange === 0;
  const TrendIcon = isNet0 ? Minus : isDown ? TrendingDown : TrendingUp;
  const trendColor = isNet0 ? "text-bmw-muted" : isDown ? "text-emerald-400" : "text-red-400";

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-bmw-muted">
        Price History
      </h4>
      <div className="rounded-lg border border-bmw-border bg-bmw-dark p-3">
        <PriceHistoryChart history={history} />
        <div className={`mt-2 flex items-center gap-1.5 text-xs ${trendColor}`}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>
            {summary!.change_count} price{" "}
            {summary!.change_count === 1 ? "change" : "changes"}
            {isNet0
              ? " \u00b7 Net unchanged"
              : <> &middot; {isDown ? "Down" : "Up"}{" "}
                  {formatCurrency(Math.abs(totalChange))} overall</>
            }
          </span>
        </div>
      </div>
    </div>
  );
}
