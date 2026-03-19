"use client";

import type { PriceHistory } from "@/lib/types";

interface PriceHistoryChartProps {
  history: PriceHistory[];
}

function formatShortPrice(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PriceHistoryChart({ history }: PriceHistoryChartProps) {
  if (history.length < 2) return null;

  // Chart dimensions
  const width = 430;
  const height = 160;
  const padLeft = 60;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 28;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Data bounds
  const prices = history.map((h) => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  // Add 10% padding to price axis
  const yMin = minPrice - priceRange * 0.1;
  const yMax = maxPrice + priceRange * 0.1;
  const yRange = yMax - yMin;

  const times = history.map((h) => new Date(h.recorded_at).getTime());
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const tRange = tMax - tMin || 1;

  // Scale functions
  const x = (t: number) => padLeft + ((t - tMin) / tRange) * plotW;
  const y = (p: number) => padTop + plotH - ((p - yMin) / yRange) * plotH;

  // Build step-line path
  let pathD = `M ${x(times[0])} ${y(prices[0])}`;
  for (let i = 1; i < history.length; i++) {
    // Horizontal to new time, then vertical to new price
    pathD += ` L ${x(times[i])} ${y(prices[i - 1])}`;
    pathD += ` L ${x(times[i])} ${y(prices[i])}`;
  }

  // Fill path (close to bottom)
  const fillD =
    pathD +
    ` L ${x(times[times.length - 1])} ${padTop + plotH}` +
    ` L ${x(times[0])} ${padTop + plotH} Z`;

  // Grid lines (3 horizontal)
  const gridLines = [0.25, 0.5, 0.75].map((frac) => {
    const price = yMin + yRange * frac;
    return { y: y(price), label: formatShortPrice(Math.round(price)) };
  });

  // Unique date labels — first, last, plus any change points
  const dateLabels: { x: number; label: string }[] = [
    { x: x(times[0]), label: formatShortDate(history[0].recorded_at) },
  ];
  // Add change points
  for (let i = 1; i < history.length - 1; i++) {
    if (prices[i] !== prices[i - 1]) {
      dateLabels.push({
        x: x(times[i]),
        label: formatShortDate(history[i].recorded_at),
      });
    }
  }
  if (history.length > 1) {
    dateLabels.push({
      x: x(times[times.length - 1]),
      label: formatShortDate(history[history.length - 1].recorded_at),
    });
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height: "160px" }}
    >
      <defs>
        <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c69d4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#1c69d4" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padLeft}
            y1={g.y}
            x2={width - padRight}
            y2={g.y}
            stroke="#2a2a2a"
            strokeDasharray="4 4"
          />
          <text
            x={padLeft - 6}
            y={g.y + 4}
            textAnchor="end"
            fill="#888888"
            fontSize="10"
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* Fill area */}
      <path d={fillD} fill="url(#priceGradient)" />

      {/* Step line */}
      <path
        d={pathD}
        fill="none"
        stroke="#1c69d4"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {history.map((h, i) => (
        <circle
          key={i}
          cx={x(times[i])}
          cy={y(h.price)}
          r="4"
          fill="#1c69d4"
          stroke="#141414"
          strokeWidth="2"
        />
      ))}

      {/* Price label on last point */}
      <text
        x={x(times[times.length - 1])}
        y={y(prices[prices.length - 1]) - 10}
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="600"
      >
        {formatShortPrice(prices[prices.length - 1])}
      </text>

      {/* Date labels */}
      {dateLabels.map((d, i) => (
        <text
          key={i}
          x={d.x}
          y={height - 4}
          textAnchor="middle"
          fill="#888888"
          fontSize="10"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}
