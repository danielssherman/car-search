import { NextResponse } from "next/server";
import { getDealers } from "@/lib/db";
import { apiError } from "@/lib/validation";

export async function GET() {
  try {
    const dealers = getDealers();
    return NextResponse.json({ dealers });
  } catch (err) {
    console.error("Error fetching dealers:", err);
    return apiError("Failed to fetch dealers", 500);
  }
}
