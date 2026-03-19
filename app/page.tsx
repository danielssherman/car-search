"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import type { Vehicle, InventoryFilters, InventoryStats, DealerInfo } from "@/lib/types";
import { triggerScrape } from "./actions";
import { StatsBar } from "@/components/StatsBar";
import { FilterBar } from "@/components/FilterBar";
import { InventoryTable } from "@/components/InventoryTable";
import { ComparePanel } from "@/components/ComparePanel";
import { AISearchBanner, AISearchLoadingSkeleton } from "@/components/AISearchBanner";
import { VehicleDetailPanel } from "@/components/VehicleDetailPanel";
import { RefreshCw, GitCompare, ChevronLeft, ChevronRight } from "lucide-react";

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

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const PAGE_SIZE = 50;

  // Detail panel state
  const [detailVin, setDetailVin] = useState<string | null>(null);

  // AI search state
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState<string | null>(null);
  const [aiFilters, setAiFilters] = useState<InventoryFilters | null>(null);

  // AbortController for cancelling superseded fetch requests
  const fetchAbortRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const parseMultiParam = (key: string): string[] => {
    const val = searchParams.get(key);
    return val ? val.split(",").filter(Boolean) : [];
  };

  const [filters, setFilters] = useState({
    make: searchParams.get("make") || "all",
    models: parseMultiParam("models"),
    dealers: parseMultiParam("dealers"),
    colors: parseMultiParam("colors"),
    conditions: parseMultiParam("conditions"),
    status: searchParams.get("status") || "all",
    minPrice: searchParams.get("minPrice") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    sort: searchParams.get("sort") || "best_value",
    search: searchParams.get("search") || "",
  });

  // Initialize AI search from URL param
  useEffect(() => {
    const aiQueryParam = searchParams.get("aiQuery");
    if (aiQueryParam) {
      setAiSearchActive(true);
      handleAiSearch(aiQueryParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUrl = useCallback(
    (newFilters: typeof filters, aiQueryParam?: string | null) => {
      const params = new URLSearchParams();
      if (aiQueryParam) {
        params.set("aiQuery", aiQueryParam);
      } else {
        if (newFilters.make !== "all") params.set("make", newFilters.make);
        if (newFilters.models.length > 0) params.set("models", newFilters.models.join(","));
        if (newFilters.dealers.length > 0) params.set("dealers", newFilters.dealers.join(","));
        if (newFilters.colors.length > 0) params.set("colors", newFilters.colors.join(","));
        if (newFilters.conditions.length > 0) params.set("conditions", newFilters.conditions.join(","));
        if (newFilters.status !== "all") params.set("status", newFilters.status);
        if (newFilters.minPrice) params.set("minPrice", newFilters.minPrice);
        if (newFilters.maxPrice) params.set("maxPrice", newFilters.maxPrice);
        if (newFilters.sort !== "best_value")
          params.set("sort", newFilters.sort);
        if (newFilters.search) params.set("search", newFilters.search);
      }

      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/", { scroll: false });
    },
    [router]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      // If AI results are showing and user changes a filter, dismiss AI mode
      if (aiExplanation) {
        setAiExplanation(null);
        setAiQuery(null);
        setAiFilters(null);
      }

      const newFilters = { ...filters, [key]: value };
      // Reset models when make changes
      if (key === "make") {
        newFilters.models = [];
      }
      setPage(1);
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl, aiExplanation]
  );

  const handleMultiFilterChange = useCallback(
    (key: string, values: string[]) => {
      if (aiExplanation) {
        setAiExplanation(null);
        setAiQuery(null);
        setAiFilters(null);
      }

      const newFilters = { ...filters, [key]: values };
      setPage(1);
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl, aiExplanation]
  );

  const handleClearFilters = useCallback(() => {
    const cleared = {
      make: "all",
      models: [] as string[],
      dealers: [] as string[],
      colors: [] as string[],
      conditions: [] as string[],
      status: "all",
      minPrice: "",
      maxPrice: "",
      sort: "best_value",
      search: "",
    };
    setFilters(cleared);
    setAiExplanation(null);
    setAiQuery(null);
    setAiFilters(null);
    updateUrl(cleared);
  }, [updateUrl]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.make !== "all") count++;
    if (filters.models.length > 0) count++;
    if (filters.dealers.length > 0) count++;
    if (filters.colors.length > 0) count++;
    if (filters.conditions.length > 0) count++;
    if (filters.status !== "all") count++;
    if (filters.minPrice) count++;
    if (filters.maxPrice) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  const fetchData = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.make !== "all") params.set("make", filters.make);
      if (filters.models.length > 0) params.set("models", filters.models.join(","));
      if (filters.dealers.length > 0) params.set("dealers", filters.dealers.join(","));
      if (filters.colors.length > 0) params.set("colors", filters.colors.join(","));
      if (filters.conditions.length > 0) params.set("conditions", filters.conditions.join(","));
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
      if (filters.sort !== "best_value") params.set("sort", filters.sort);
      if (filters.search) params.set("search", filters.search);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const signal = controller.signal;
      const [inventoryRes, statsRes, dealersRes] = await Promise.all([
        fetch(`/api/inventory?${params.toString()}`, { signal }),
        fetch("/api/stats", { signal }),
        fetch("/api/dealers", { signal }),
      ]);

      const inventoryData = await inventoryRes.json();
      const statsData = await statsRes.json();
      const dealersData = await dealersRes.json();

      setVehicles(inventoryData.vehicles || []);
      setTotalPages(inventoryData.totalPages || 1);
      setTotalVehicles(inventoryData.total || 0);
      setStats(statsData);
      setDealers(dealersData.dealers || []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Failed to fetch data:", err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filters, page]);

  useEffect(() => {
    // Don't fetch with regular filters if AI results are showing
    if (!aiExplanation) {
      fetchData();
    }
  }, [fetchData, aiExplanation]);

  // Fetch stats/dealers on mount (needed even during AI search for dropdowns)
  useEffect(() => {
    async function fetchMeta() {
      try {
        const [statsRes, dealersRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/dealers"),
        ]);
        setStats(await statsRes.json());
        setDealers((await dealersRes.json()).dealers || []);
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
      }
    }
    if (aiExplanation && !stats) {
      fetchMeta();
    }
  }, [aiExplanation, stats]);

  const handleAiSearch = async (query: string) => {
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiSearchLoading(true);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI search failed");
      }

      const data = await res.json();
      setVehicles(data.vehicles || []);
      setAiExplanation(data.explanation);
      setAiQuery(query);
      setAiFilters(data.filters);
      updateUrl(filters, query);

      if (data.fallback) {
        setToast("AI search unavailable — showing text search results");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "AI search failed";
      setToast(message);
      // Don't clear AI mode on error — let user retry
    } finally {
      if (!controller.signal.aborted) {
        setAiSearchLoading(false);
        setLoading(false);
      }
    }
  };

  const handleDismissAi = useCallback(() => {
    setAiExplanation(null);
    setAiQuery(null);
    setAiFilters(null);
    setAiSearchActive(false);
    updateUrl(filters);
  }, [filters, updateUrl]);

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
              {totalVehicles > 0 ? `${totalVehicles.toLocaleString()} vehicles` : ""} &middot; Last updated:{" "}
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
        <StatsBar stats={stats} loading={loading && !aiExplanation} />
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onMultiFilterChange={handleMultiFilterChange}
        onClearFilters={handleClearFilters}
        dealers={dealers}
        makes={stats?.makes || []}
        modelCounts={stats?.count_by_model || {}}
        colorCounts={stats?.color_distribution || {}}
        conditionCounts={stats?.count_by_condition || {}}
        activeFilterCount={activeFilterCount}
        aiSearchActive={aiSearchActive}
        onToggleAiSearch={() => {
          setAiSearchActive(!aiSearchActive);
          if (aiExplanation) {
            handleDismissAi();
          }
        }}
        onAiSearchSubmit={handleAiSearch}
        aiSearchLoading={aiSearchLoading}
      />

      {/* AI Search Banner */}
      {aiSearchLoading && (
        <div className="pt-3">
          <AISearchLoadingSkeleton />
        </div>
      )}
      {!aiSearchLoading && aiExplanation && aiQuery && aiFilters && (
        <div className="pt-3">
          <AISearchBanner
            query={aiQuery}
            explanation={aiExplanation}
            filters={aiFilters}
            onDismiss={handleDismissAi}
          />
        </div>
      )}

      {/* Results count + pagination */}
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-bmw-muted">
            {loading
              ? "Loading..."
              : totalVehicles > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalVehicles)} of ${totalVehicles.toLocaleString()}`
              : "No vehicles found"}
            {selectedVins.size > 0 && (
              <span className="ml-2 text-bmw-blue">
                ({selectedVins.size} selected)
              </span>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-md border border-bmw-border p-1.5 text-bmw-muted hover:text-white hover:border-bmw-blue/50 disabled:opacity-30 disabled:hover:text-bmw-muted disabled:hover:border-bmw-border transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm tabular-nums text-bmw-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-md border border-bmw-border p-1.5 text-bmw-muted hover:text-white hover:border-bmw-blue/50 disabled:opacity-30 disabled:hover:text-bmw-muted disabled:hover:border-bmw-border transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="mx-auto max-w-7xl px-4 pb-6 md:px-6">
        <InventoryTable
          vehicles={vehicles}
          loading={loading}
          selectedVins={selectedVins}
          onToggleSelect={handleToggleSelect}
          onRowClick={(vin) => setDetailVin(vin)}
        />
      </div>

      {/* Vehicle Detail Panel */}
      {detailVin && (
        <VehicleDetailPanel
          vin={detailVin}
          onClose={() => setDetailVin(null)}
        />
      )}

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
