
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint is disabled. The frontend now talks directly to the MoneyLeaks backend API.",
    },
    { status: 410 }
  );
}
