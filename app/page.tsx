"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import type { Vehicle, InventoryStats, DealerInfo } from "@/lib/types";
import { triggerScrape } from "./actions";
import { StatsBar } from "@/components/StatsBar";
import { FilterBar } from "@/components/FilterBar";
import { InventoryTable } from "@/components/InventoryTable";
import { ComparePanel } from "@/components/ComparePanel";
import { RefreshCw, GitCompare } from "lucide-react";

function formatTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] animate-in slide-in-from-bottom-4 rounded-lg border border-bmw-border bg-bmw-card px-4 py-3 text-sm shadow-xl">
      {message}
    </div>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<
    (InventoryStats & { last_scraped: string | null }) | null
  >(null);
  const [dealers, setDealers] = useState<DealerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedVins, setSelectedVins] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const [filters, setFilters] = useState({
    make: searchParams.get("make") || "all",
    model: searchParams.get("model") || "all",
    dealer: searchParams.get("dealer") || "",
    color: searchParams.get("color") || "",
    status: searchParams.get("status") || "all",
    minPrice: searchParams.get("minPrice") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    sort: searchParams.get("sort") || "best_value",
    search: searchParams.get("search") || "",
  });

  const updateUrl = useCallback(
    (newFilters: typeof filters) => {
      const params = new URLSearchParams();
      if (newFilters.make !== "all") params.set("make", newFilters.make);
      if (newFilters.model !== "all") params.set("model", newFilters.model);
      if (newFilters.dealer) params.set("dealer", newFilters.dealer);
      if (newFilters.color) params.set("color", newFilters.color);
      if (newFilters.status !== "all") params.set("status", newFilters.status);
      if (newFilters.minPrice) params.set("minPrice", newFilters.minPrice);
      if (newFilters.maxPrice) params.set("maxPrice", newFilters.maxPrice);
      if (newFilters.sort !== "best_value")
        params.set("sort", newFilters.sort);
      if (newFilters.search) params.set("search", newFilters.search);

      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/", { scroll: false });
    },
    [router]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      const newFilters = { ...filters, [key]: value };
      // Reset model when make changes
      if (key === "make") {
        newFilters.model = "all";
      }
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  const handleClearFilters = useCallback(() => {
    const cleared = {
      make: "all",
      model: "all",
      dealer: "",
      color: "",
      status: "all",
      minPrice: "",
      maxPrice: "",
      sort: "best_value",
      search: "",
    };
    setFilters(cleared);
    updateUrl(cleared);
  }, [updateUrl]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.make !== "all") count++;
    if (filters.model !== "all") count++;
    if (filters.dealer) count++;
    if (filters.color) count++;
    if (filters.status !== "all") count++;
    if (filters.minPrice) count++;
    if (filters.maxPrice) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.make !== "all") params.set("make", filters.make);
      if (filters.model !== "all") params.set("model", filters.model);
      if (filters.dealer) params.set("dealer", filters.dealer);
      if (filters.color) params.set("color", filters.color);
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
      if (filters.sort !== "best_value") params.set("sort", filters.sort);
      if (filters.search) params.set("search", filters.search);

      const [inventoryRes, statsRes, dealersRes] = await Promise.all([
        fetch(`/api/inventory?${params.toString()}`),
        fetch("/api/stats"),
        fetch("/api/dealers"),
      ]);

      const inventoryData = await inventoryRes.json();
      const statsData = await statsRes.json();
      const dealersData = await dealersRes.json();

      setVehicles(inventoryData.vehicles || []);
      setStats(statsData);
      setDealers(dealersData.dealers || []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      const result = await triggerScrape();
      if (result) {
        setToast(
          `Scrape complete: ${result.found} vehicles found, ${result.newCount} new`
        );
        fetchData();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Scrape request failed";
      setToast(`Scrape failed: ${message}`);
    } finally {
      setScraping(false);
    }
  };

  const handleToggleSelect = useCallback((vin: string) => {
    setSelectedVins((prev) => {
      const next = new Set(prev);
      if (next.has(vin)) {
        next.delete(vin);
      } else if (next.size < 3) {
        next.add(vin);
      }
      return next;
    });
  }, []);

  const selectedVehicles = useMemo(
    () => vehicles.filter((v) => selectedVins.has(v.vin)),
    [vehicles, selectedVins]
  );

  const colors = useMemo(() => {
    if (!stats?.color_distribution) return [];
    return Object.keys(stats.color_distribution).sort();
  }, [stats]);

  return (
    <div
      className={`min-h-screen ${
        showCompare && selectedVehicles.length > 0 ? "pb-80" : ""
      }`}
    >
      {/* Header */}
      <header className="border-b border-bmw-border px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Bay Area Car Tracker
            </h1>
            <p className="mt-0.5 text-xs text-bmw-muted">
              Top 100 by value score &middot; Last updated:{" "}
              {formatTime(stats?.last_scraped ?? null)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedVins.size > 0 && (
              <button
                onClick={() => setShowCompare(!showCompare)}
                className="flex items-center gap-2 rounded-md border border-bmw-blue bg-bmw-blue/10 px-3 py-2 text-sm font-medium text-bmw-blue hover:bg-bmw-blue/20 transition-colors"
              >
                <GitCompare className="h-4 w-4" />
                Compare ({selectedVins.size})
              </button>
            )}
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="flex items-center gap-2 rounded-md bg-bmw-blue px-4 py-2 text-sm font-medium text-white hover:bg-bmw-blue/90 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${scraping ? "animate-spin" : ""}`}
              />
              {scraping ? "Scraping..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">
        <StatsBar stats={stats} loading={loading} />
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        dealers={dealers}
        colors={colors}
        makes={stats?.makes || []}
        models={stats?.models || []}
        activeFilterCount={activeFilterCount}
      />

      {/* Results count */}
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
        <p className="text-sm text-bmw-muted">
          {loading
            ? "Loading..."
            : `${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""}`}
          {selectedVins.size > 0 && (
            <span className="ml-2 text-bmw-blue">
              ({selectedVins.size} selected for comparison)
            </span>
          )}
        </p>
      </div>

      {/* Inventory Table */}
      <div className="mx-auto max-w-7xl px-4 pb-6 md:px-6">
        <InventoryTable
          vehicles={vehicles}
          loading={loading}
          selectedVins={selectedVins}
          onToggleSelect={handleToggleSelect}
        />
      </div>

      {/* Compare Panel */}
      {showCompare && selectedVehicles.length > 0 && (
        <ComparePanel
          vehicles={selectedVehicles}
          onClose={() => {
            setShowCompare(false);
            setSelectedVins(new Set());
          }}
          onRemove={(vin) => {
            setSelectedVins((prev) => {
              const next = new Set(prev);
              next.delete(vin);
              if (next.size === 0) setShowCompare(false);
              return next;
            });
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-bmw-blue border-t-transparent" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
