import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sha256Base64Utf8, digigoAuthorizeUrl, digigoRedirectUri } from "@/lib/digigo/client";

function s(v: any) {
  return String(v ?? "").trim();
}

function getSupabase() {
  const cookieStore = cookies();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    const back_url = s(body?.back_url);

    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: sig, error: sigErr } = await supabase
      .from("invoice_signatures")
      .select("unsigned_xml, company_id")
      .eq("invoice_id", invoice_id)
      .single();

    if (sigErr || !sig?.unsigned_xml) {
      return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_XML" }, { status: 400 });
    }

    const company_id = s(sig.company_id);
    if (!company_id) {
      return NextResponse.json({ ok: false, error: "MISSING_COMPANY_ID" }, { status: 400 });
    }

    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("digigo_credential_id")
      .eq("id", company_id)
      .single();

    if (companyErr) {
      return NextResponse.json({ ok: false, error: "COMPANY_LOOKUP_FAILED" }, { status: 400 });
    }

    const credentialId = s(company?.digigo_credential_id);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CREDENTIAL" }, { status: 400 });
    }

    const hash = sha256Base64Utf8(sig.unsigned_xml);
    const state = randomUUID();

    const { error: insErr } = await supabase.from("digigo_sign_sessions").insert({
      invoice_id,
      state,
      status: "pending",
      created_by: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      company_id,
      environment: "production",
    });

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    const baseRedirect = digigoRedirectUri();
    const ru = new URL(baseRedirect);
    ru.searchParams.set("invoice_id", invoice_id);

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
      state,
      redirectUri: ru.toString(),
    });

    return NextResponse.json({
      ok: true,
      authorize_url,
      state,
      invoice_id,
      back_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "START_ERROR") },
      { status: 500 }
    );
  }
}
