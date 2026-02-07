import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const company_name = s(body?.company_name);
    const tax_id = s(body?.tax_id) || null;

    const address = s(body?.address) || null;
    const email = s(body?.email) || null;
    const phone = s(body?.phone) || null;

    if (!company_name) {
      return NextResponse.json({ ok: false, error: "company_name required" }, { status: 400 });
    }

    const { data: profile, error: pErr } = await supabase
      .from("app_users")
      .select("max_companies")
      .eq("id", auth.user.id)
      .single();

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
    }

    const max = profile?.max_companies ?? 1;

    if (max <= 1) {
      const { count, error: cntErr } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", auth.user.id);

      if (cntErr) {
        return NextResponse.json({ ok: false, error: cntErr.message }, { status: 400 });
      }

      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { ok: false, error: "Limite atteinte: une seule société autorisée." },
          { status: 403 }
        );
      }
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc("create_company_with_owner", {
      p_company_name: company_name,
      p_tax_id: tax_id,
      p_address: address,
      p_email: email,
      p_phone: phone,
    });

    if (rpcErr) {
      return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 400 });
    }

    const companyId =
      (rpcData as any)?.company_id ?? (rpcData as any)?.id ?? (typeof rpcData === "string" ? rpcData : null);

    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "RPC returned no company_id" },
        { status: 500 }
      );
    }

    const { data: comp, error: cErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, company: comp }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
