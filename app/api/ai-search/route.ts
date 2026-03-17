import { NextRequest, NextResponse } from "next/server";
import { getVehicles } from "@/lib/db";
import { parseNaturalLanguageQuery } from "@/lib/ai-search";

export async function POST(request: NextRequest) {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const query = body.query?.trim();
  if (!query || query.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: query" },
      { status: 400 }
    );
  }

  if (query.length > 500) {
    return NextResponse.json(
      { error: "Query must be 500 characters or less" },
      { status: 400 }
    );
  }

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
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 }
      );
    }
  }
}
