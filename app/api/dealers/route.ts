import { NextResponse } from "next/server";
import { getDealers } from "@/lib/db";

export async function GET() {
  try {
    const dealers = getDealers();
    return NextResponse.json({ dealers });
  } catch (err) {
    console.error("Error fetching dealers:", err);
    return NextResponse.json(
      { error: "Failed to fetch dealers" },
      { status: 500 }
    );
  }
}
