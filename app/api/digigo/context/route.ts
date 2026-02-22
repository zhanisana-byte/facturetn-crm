// app/api/digigo/context/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { s } from "@/lib/digigo/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  const ck = cookies();
  return NextResponse.json({
    state: s(ck.get("dg_state")?.value),
    invoice_id: s(ck.get("dg_invoice_id")?.value),
    back_url: s(ck.get("dg_back_url")?.value),
  });
}
