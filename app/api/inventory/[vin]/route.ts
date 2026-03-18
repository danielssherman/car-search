import { NextRequest, NextResponse } from "next/server";
import { getVehicleByVin, getListingsForVin } from "@/lib/db";
import { VinSchema, apiError } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: { vin: string } }
) {
  const vinResult = VinSchema.safeParse(params.vin);
  if (!vinResult.success) {
    return apiError("Invalid VIN format", 400, vinResult.error.issues);
  }

  const vin = vinResult.data;

  try {
    const vehicle = getVehicleByVin(vin);
    if (!vehicle) {
      return apiError("Vehicle not found", 404);
    }
    const listings = getListingsForVin(vin);
    return NextResponse.json({ ...vehicle, listings });
  } catch (err) {
    console.error("Error fetching vehicle:", err);
    return apiError("Failed to fetch vehicle", 500);
  }
}
