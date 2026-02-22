// app/api/digigo/start/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/digigo/supabaseAdmin";
import { s, uuid } from "@/lib/digigo/ids";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const invoice_id = s(body?.invoice_id);
  const back_url = s(body?.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/invoices");
  const credentialId = s(body?.credentialId);
  const hash = s(body?.hash);
  const clientId = s(process.env.DIGIGO_CLIENT_ID);
  const base = s(process.env.DIGIGO_BASE_URL).replace(/\/$/, "");
  const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);
  const numSignatures = s(body?.numSignatures || 1);
  const scope = s(body?.scope || "credential");

  if (!invoice_id) return NextResponse.json({ error: "BAD_INVOICE_ID" }, { status: 400 });
  if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
  if (!hash) return NextResponse.json({ error: "MISSING_HASH" }, { status: 400 });
  if (!clientId || !base || !redirectUri) return NextResponse.json({ error: "DIGIGO_ENV_MISSING" }, { status: 500 });

  const state = uuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  const admin = supabaseAdmin();
  const { error } = await admin.from("digigo_sign_sessions").insert({
    invoice_id,
    state,
    back_url,
    status: "pending",
    digigo_jti: null,
    error_message: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return NextResponse.json(
      { error: "SESSION_CREATE_FAILED", details: error.message },
      { status: 500 }
    );
  }

  const authorizeUrl =
    `${base}/tunsign-proxy-webapp/oauth2/authorize` +
    `?redirectUri=${encodeURIComponent(redirectUri)}` +
    `&responseType=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&credentialId=${encodeURIComponent(credentialId)}` +
    `&clientId=${encodeURIComponent(clientId)}` +
    `&numSignatures=${encodeURIComponent(String(numSignatures))}` +
    `&hash=${encodeURIComponent(hash)}` +
    `&state=${encodeURIComponent(state)}`;

  const res = NextResponse.json({ state, authorizeUrl, invoice_id, back_url });

  const secure = process.env.NODE_ENV === "production";
  const common = { httpOnly: true as const, sameSite: "lax" as const, secure, path: "/", maxAge: 60 * 60 };

  res.cookies.set({ name: "dg_state", value: state, ...common });
  res.cookies.set({ name: "dg_invoice_id", value: invoice_id, ...common });
  res.cookies.set({ name: "dg_back_url", value: back_url, ...common });

  return res;
}
