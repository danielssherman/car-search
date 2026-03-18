import { NextRequest, NextResponse } from "next/server";
import { getVehicles } from "@/lib/db";
import { parseNaturalLanguageQuery } from "@/lib/ai-search";
import { AISearchBodySchema, apiError } from "@/lib/validation";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const result = AISearchBodySchema.safeParse(body);
  if (!result.success) {
    return apiError("Validation error", 400, result.error.issues);
  }

  const query = result.data.query; // already trimmed by schema

  try {
    const { filters, explanation } = await parseNaturalLanguageQuery(query);
    const vehicles = getVehicles({ ...filters, limit: 100 });

    return NextResponse.json({
      query,
      filters,
      explanation,
      vehicles,
      count: vehicles.length,
    });
  } catch (err) {
    console.error("AI search error, falling back to text search:", err);

    // Fallback: use raw query as text search
    try {
      const vehicles = getVehicles({ search: query, limit: 100 });
      return NextResponse.json({
        query,
        filters: { search: query },
        explanation: "AI search unavailable — showing text search results instead.",
        vehicles,
        count: vehicles.length,
        fallback: true,
      });
    } catch (fallbackErr) {
      console.error("Fallback search also failed:", fallbackErr);
      return apiError("Search failed", 500);
    }
  }
}
