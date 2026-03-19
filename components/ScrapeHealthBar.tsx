"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Server, Clock } from "lucide-react";
import type { ScrapeHealthResponse, SourceHealth } from "@/lib/types";

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type HealthStatus = "healthy" | "warning" | "error";

function HealthCard({
  icon: Icon,
  label,
  value,
  subtext,
  status = "healthy",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  status?: HealthStatus;
}) {
  const statusColor = {
    healthy: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-red-400",
  }[status];

  return (
    <div className="rounded-lg border border-bmw-border bg-bmw-card p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${statusColor}`} />
        <p className="text-[10px] font-medium uppercase tracking-wider text-bmw-muted">
          {label}
        </p>
      </div>
      <p className={`mt-1 text-base font-semibold tracking-tight ${statusColor}`}>
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-[10px] text-bmw-muted">{subtext}</p>
      )}
    </div>
  );
}

function scrapeTimingStatus(iso: string | null): HealthStatus {
  if (!iso) return "error";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 8 * 3600_000) return "healthy";
  if (ms < 24 * 3600_000) return "warning";
  return "error";
}

function sourceStatus(src: SourceHealth | undefined): HealthStatus {
  if (!src || src.total_runs === 0) return "error";
  const rate = src.successes / src.total_runs;
  if (rate > 0.9) return "healthy";
  if (rate > 0.7) return "warning";
  return "error";
}

export function ScrapeHealthBar() {
  const [health, setHealth] = useState<ScrapeHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/scrape-health", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[76px] animate-pulse rounded-lg border border-bmw-border bg-bmw-card"
          />
        ))}
      </div>
    );
  }

  if (!health) return null;

  const ddcHealth = health.source_health?.dealer_ddc;
  const algoliaHealth = health.source_health?.dealer_algolia;
  const lastStatus = scrapeTimingStatus(health.last_successful_scrape);
  const ddcStatus = sourceStatus(ddcHealth);
  const algoliaStatus = sourceStatus(algoliaHealth);

  const overallStatus: HealthStatus =
    lastStatus === "error" || ddcStatus === "error" || algoliaStatus === "error"
      ? "error"
      : lastStatus === "warning" || ddcStatus === "warning" || algoliaStatus === "warning"
        ? "warning"
        : "healthy";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <HealthCard
        icon={Clock}
        label="Last Scrape"
        value={formatTimeAgo(health.last_successful_scrape)}
        subtext={formatTimestamp(health.last_successful_scrape)}
        status={lastStatus}
      />
      <HealthCard
        icon={Database}
        label="DDC Pipeline"
        value={ddcHealth ? `${ddcHealth.last_vehicles.toLocaleString()} vehicles` : "No data"}
        subtext={ddcHealth ? `${ddcHealth.successes}/${ddcHealth.total_runs} successful` : undefined}
        status={ddcStatus}
      />
      <HealthCard
        icon={Server}
        label="Algolia Pipeline"
        value={algoliaHealth ? `${algoliaHealth.last_vehicles.toLocaleString()} vehicles` : "No data"}
        subtext={algoliaHealth ? `${algoliaHealth.successes}/${algoliaHealth.total_runs} successful` : undefined}
        status={algoliaStatus}
      />
      <HealthCard
        icon={Activity}
        label="Pipeline Health"
        value={overallStatus === "healthy" ? "Healthy" : overallStatus === "warning" ? "Warning" : "Degraded"}
        subtext={`${health.active_vehicles.toLocaleString()} active, ${health.removed_vehicles.toLocaleString()} removed`}
        status={overallStatus}
      />
    </div>
  );
}
