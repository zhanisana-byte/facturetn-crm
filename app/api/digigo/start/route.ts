import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const service = createServiceClient();

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id || body?.invoiceId || "");
    const back_url = s(body?.back_url || body?.backUrl || body?.back || "");

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    const invRes = await service
      .from("invoices")
      .select("company_id, environment")
      .eq("id", invoice_id)
      .maybeSingle();

    const company_id = s(invRes.data?.company_id || "");
    const environment = s(invRes.data?.environment || body?.environment || "test") || "test";

    if (!company_id) {
      return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });
    }

    const state =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await service.from("digigo_sign_sessions").insert({
      invoice_id,
      company_id,
      environment,
      state,
      status: "pending",
      created_by: user.id,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const jar = await cookies();
    const secure = true;

    jar.set("digigo_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 60 * 15,
    });

    jar.set("digigo_invoice_id", invoice_id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 60 * 15,
    });

    jar.set("digigo_back_url", back_url || "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 60 * 15,
    });

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/digigo/redirect`;

    const authorize_url = digigoAuthorizeUrl({
      redirectUri,
      state,
    });

    return NextResponse.json(
      { ok: true, authorize_url, state },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: s(e?.message || e) },
      { status: 500 }
    );
  }
}
