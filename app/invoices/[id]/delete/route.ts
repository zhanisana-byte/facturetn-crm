import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id  } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error: delItemsErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (delItemsErr) {
    return NextResponse.json({ ok: false, error: delItemsErr.message }, { status: 400 });
  }

  const { error: delInvErr } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id);

  if (delInvErr) {
    return NextResponse.json({ ok: false, error: delInvErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
