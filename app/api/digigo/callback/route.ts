import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const cookieStore = cookies();
  const body = await req.json().catch(() => ({} as any));

  const token = s(body.token);
  const code = s(body.code);
  const invoice_id = s(body.invoice_id);
  const back_url = s(body.back_url);

  const stateFromCookie = s(cookieStore.get("digigo_state")?.value);
  const state = s(body.state) || stateFromCookie;

  if (!state) {
    return NextResponse.json({ error: "MISSING_STATE" }, { status: 400 });
  }

  const supabase = createClient();

  const { data: sess } = await supabase.auth.getUser();
  if (!sess?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: stRow } = await supabase
    .from("digigo_oauth_states")
    .select("id,state,user_id,company_id,invoice_id,back_url,created_at")
    .eq("state", state)
    .maybeSingle();

  if (!stRow?.id) {
    return NextResponse.json({ error: "INVALID_STATE" }, { status: 400 });
  }

  const resolvedInvoiceId = invoice_id || s(stRow.invoice_id);
  const resolvedBackUrl = back_url || s(stRow.back_url);

  if (!resolvedInvoiceId) {
    return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
  }

  await supabase
    .from("digigo_oauth_states")
    .delete()
    .eq("id", stRow.id);

  cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });

  await supabase
    .from("invoices")
    .update({
      signature_status: "signed",
      state: "pending",
    })
    .eq("id", resolvedInvoiceId);

  return NextResponse.json({ ok: true, back_url: resolvedBackUrl });
}
