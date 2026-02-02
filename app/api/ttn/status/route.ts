import { NextResponse } from "next/server";
import { isTTNEnabled, getTTNMode } from "@/lib/ttn/ttn.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = isTTNEnabled();
  const mode = getTTNMode();

  return NextResponse.json({
    ok: true,
    service: "ttn-connector",
    status: enabled ? "active" : "disabled",
    mode: process.env.NODE_ENV === "production" ? "real" : mode,
    checked_at: new Date().toISOString(),
  });
}
