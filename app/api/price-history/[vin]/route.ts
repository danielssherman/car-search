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
    return NextResponse.json({
      vin,
      total: history.length,
      history,
    });
  } catch (err) {
    console.error("Error fetching price history:", err);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
