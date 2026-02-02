import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: false, error: "SIGNATURE_AGENT_DISABLED" }, { status: 410 });
}
