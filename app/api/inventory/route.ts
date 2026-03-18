import { NextRequest, NextResponse } from "next/server";
import { getVehicles, countVehicles } from "@/lib/db";
import type { InventoryFilters } from "@/lib/types";
import { InventoryQuerySchema, apiError } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Collect all params into a plain object for validation
  const rawParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (value) rawParams[key] = value;
  });

  const result = InventoryQuerySchema.safeParse(rawParams);
  if (!result.success) {
    return apiError("Validation error", 400, result.error.issues);
  }

  const validated = result.data;

  const parseMulti = (val: string | undefined): string[] | undefined => {
    if (!val) return undefined;
    const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };

  const page = validated.page;
  const pageSize = validated.pageSize;
  const offset = (page - 1) * pageSize;

  const filters: InventoryFilters = {
    make: validated.make || undefined,
    model: validated.model || undefined,
    models: parseMulti(validated.models),
    dealer: validated.dealer || undefined,
    dealers: parseMulti(validated.dealers),
    color: validated.color || undefined,
    colors: parseMulti(validated.colors),
    condition: validated.condition || undefined,
    conditions: parseMulti(validated.conditions),
    maxPrice: validated.maxPrice,
    minPrice: validated.minPrice,
    status: validated.status || undefined,
    sort: validated.sort || undefined,
    search: validated.search || undefined,
    limit: pageSize,
    offset,
  };

  try {
    const total = countVehicles(filters);
    const vehicles = getVehicles(filters);
    const totalPages = Math.ceil(total / pageSize);
    return NextResponse.json({
      vehicles,
      count: vehicles.length,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error("Error fetching inventory:", err);
    return apiError("Failed to fetch inventory", 500);
  }
}
