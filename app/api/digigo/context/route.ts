import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET() {
  const ck = await cookies();
  return NextResponse.json({
    state: s(ck.get("dg_state")?.value),
    invoice_id: s(ck.get("dg_invoice_id")?.value),
    back_url: s(ck.get("dg_back_url")?.value),
  });
}
