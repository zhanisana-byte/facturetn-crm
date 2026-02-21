import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function s(v: any) {
  return String(v ?? "").trim();
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await cookies();

  const invoice_id = s(c.get("digigo_invoice_id")?.value || "");
  const back_url = s(c.get("digigo_back_url")?.value || "");
  const state = s(c.get("digigo_state")?.value || "");

  return NextResponse.json(
    {
      ok: true,
      invoice_id,
      back_url,
      state,
    },
    { status: 200 }
  );
}
