import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {

  return NextResponse.json({
    ok: true,
    message: "Service disponible (placeholder)",
    checked_at: new Date().toISOString(),
  });
}
