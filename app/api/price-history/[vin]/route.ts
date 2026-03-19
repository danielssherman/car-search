import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const { vin } = params;

    // VIN validation: 17 alphanumeric chars (excluding I, O, Q per spec)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return NextResponse.json(
        { error: "Invalid VIN format. Must be 17 alphanumeric characters." },
        { status: 400 }
      );
    }

    const history = getPriceHistory(vin);
    const prices = history.map((h) => h.price);
    const uniquePrices = new Set(prices).size;

    const summary = history.length > 0
      ? {
          has_changes: uniquePrices > 1,
          change_count: history.filter((h, i) => i > 0 && h.price !== history[i - 1].price).length,
          first_price: history[0].price,
          latest_price: history[history.length - 1].price,
          min_price: Math.min(...prices),
          max_price: Math.max(...prices),
          total_change: history[history.length - 1].price - history[0].price,
          first_recorded: history[0].recorded_at,
          latest_recorded: history[history.length - 1].recorded_at,
        }
      : null;

    return NextResponse.json({
      vin,
      total: history.length,
      history,
      summary,
    });
  } catch (err) {
    console.error("Error fetching price history:", err);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
