import { NextRequest, NextResponse } from "next/server";
import { getVehicleByVin, getListingsForVin } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vehicle = getVehicleByVin(params.vin);
    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 }
      );
    }
    const listings = getListingsForVin(params.vin);
    return NextResponse.json({ ...vehicle, listings });
  } catch (err) {
    console.error("Error fetching vehicle:", err);
    return NextResponse.json(
      { error: "Failed to fetch vehicle" },
      { status: 500 }
    );
  }
}
