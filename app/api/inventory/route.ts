import { NextRequest, NextResponse } from "next/server";
import { getVehicles } from "@/lib/db";
import type { InventoryFilters } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parseMulti = (key: string): string[] | undefined => {
    const val = searchParams.get(key);
    if (!val) return undefined;
    const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };

  const filters: InventoryFilters = {
    make: searchParams.get("make") || undefined,
    model: searchParams.get("model") || undefined,
    models: parseMulti("models"),
    dealer: searchParams.get("dealer") || undefined,
    dealers: parseMulti("dealers"),
    color: searchParams.get("color") || undefined,
    colors: parseMulti("colors"),
    condition: searchParams.get("condition") || undefined,
    conditions: parseMulti("conditions"),
    maxPrice: searchParams.get("maxPrice")
      ? parseInt(searchParams.get("maxPrice")!)
      : undefined,
    minPrice: searchParams.get("minPrice")
      ? parseInt(searchParams.get("minPrice")!)
      : undefined,
    status: searchParams.get("status") || undefined,
    sort: searchParams.get("sort") || undefined,
    search: searchParams.get("search") || undefined,
  };

  try {
    const vehicles = getVehicles(filters);
    return NextResponse.json({ vehicles, count: vehicles.length });
  } catch (err) {
    console.error("Error fetching inventory:", err);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}
