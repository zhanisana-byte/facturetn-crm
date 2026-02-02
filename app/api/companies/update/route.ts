import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const company_id = String(body?.company_id ?? "").trim();

    if (!company_id) {
      return NextResponse.json({ ok: false, error: "company_id required" }, { status: 400 });
    }

    const { data: mem } = await supabase
      .from("memberships")
      .select("role,is_active")
      .eq("company_id", company_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!mem?.is_active) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const patch: any = {
      company_name: body?.company_name ? String(body.company_name).trim() : undefined,
      tax_id: body?.tax_id !== undefined ? String(body.tax_id).trim() || null : undefined,
      address: body?.address !== undefined ? String(body.address).trim() || null : undefined,
      email: body?.email !== undefined ? String(body.email).trim() || null : undefined,
      phone: body?.phone !== undefined ? String(body.phone).trim() || null : undefined,
    };

    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    const { error } = await supabase.from("companies").update(patch).eq("id", company_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown" }, { status: 500 });
  }
}
