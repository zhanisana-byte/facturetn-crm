import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoBaseUrl } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function readTextSafe(r: Response) {
  const t = await r.text().catch(() => "");
  return t.length > 2000 ? t.slice(0, 2000) : t;
}

async function readJsonSafe(r: Response) {
  const t = await r.text().catch(() => "");
  if (!t) return { ok: false, _raw: "" };
  try {
    return JSON.parse(t);
  } catch {
    return { ok: false, _raw: t.length > 2000 ? t.slice(0, 2000) : t };
  }
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();

    const body = await req.json().catch(() => ({}));
    const token = s(body.token);
    const code = s(body.code);
    let state = s(body.state);
    const invoice_id = s(body.invoice_id);

    if (!token && !code) {
      return NextResponse.json(
        { ok: false, error: "MISSING_TOKEN_OR_CODE" },
        { status: 400 }
      );
    }

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json(
        { ok: false, error: "MISSING_INVOICE_ID" },
        { status: 400 }
      );
    }

    if (!state || !isUuid(state)) {
      const sessFind = await service
        .from("digigo_sign_sessions")
        .select("state, expires_at, status, created_at")
        .eq("invoice_id", invoice_id)
        .in("status", ["pending"])
        .order("created_at", { ascending: false })
        .limit(1);

      const sess = sessFind.data?.[0];
      const exp = s(sess?.expires_at);
      const isExpired = exp ? new Date(exp).getTime() <= Date.now() : true;

      if (!sess?.state || !isUuid(sess.state) || isExpired) {
        return NextResponse.json(
          { ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." },
          { status: 410 }
        );
      }

      state = sess.state;
    }

    const sessRes = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    const session = sessRes.data;
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (s(session.invoice_id) !== invoice_id) {
      return NextResponse.json(
        { ok: false, error: "SESSION_MISMATCH" },
        { status: 409 }
      );
    }

    const exp = s(session.expires_at);
    if (exp && new Date(exp).getTime() <= Date.now()) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "expired" })
        .eq("state", state);
      return NextResponse.json(
        { ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." },
        { status: 410 }
      );
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const sig = sigRes.data;
    if (!sig?.unsigned_hash) {
      return NextResponse.json(
        { ok: false, error: "MISSING_UNSIGNED_HASH" },
        { status: 400 }
      );
    }

    const base = s(digigoBaseUrl()).replace(/\/$/, "");
    const tokenUrl = `${base}/tunsign-proxy-webapp/services/v1/auth/token`;
    const signUrl = `${base}/tunsign-proxy-webapp/services/v1/signatures/signHash`;

    let accessToken = "";

    if (code) {
      const tokenResp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });

      const ct = s(tokenResp.headers.get("content-type") || "");
      if (!tokenResp.ok) {
        const payload = ct.includes("application/json")
          ? await readJsonSafe(tokenResp)
          : { ok: false, _raw: await readTextSafe(tokenResp) };
        return NextResponse.json(
          { ok: false, error: "DIGIGO_TOKEN_FAILED", status: tokenResp.status, details: payload },
          { status: 502 }
        );
      }

      const payload = ct.includes("application/json")
        ? await readJsonSafe(tokenResp)
        : { ok: false, _raw: await readTextSafe(tokenResp) };

      accessToken = s(payload?.accessToken || payload?.access_token || "");
      if (!accessToken) {
        return NextResponse.json(
          { ok: false, error: "DIGIGO_TOKEN_EMPTY", details: payload },
          { status: 502 }
        );
      }
    } else {
      accessToken = token;
    }

    const signBody = {
      accessToken,
      hashes: [s(sig.unsigned_hash)],
      state,
    };

    const signResp = await fetch(signUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signBody),
      cache: "no-store",
    });

    const signCt = s(signResp.headers.get("content-type") || "");
    if (!signResp.ok) {
      const payload = signCt.includes("application/json")
        ? await readJsonSafe(signResp)
        : { ok: false, _raw: await readTextSafe(signResp) };
      await service
        .from("digigo_sign_sessions")
        .update({ status: "failed" })
        .eq("state", state);
      await service
        .from("invoice_signatures")
        .update({ state: "failed", error_message: "DIGIGO_SIGNHASH_FAILED" })
        .eq("invoice_id", invoice_id);
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNHASH_FAILED", status: signResp.status, details: payload },
        { status: 502 }
      );
    }

    const signPayload = signCt.includes("application/json")
      ? await readJsonSafe(signResp)
      : { ok: false, _raw: await readTextSafe(signResp) };

    const signedXml = s(
      signPayload?.signedXml ||
        signPayload?.signed_xml ||
        signPayload?.xml ||
        signPayload?.result?.signedXml ||
        ""
    );

    if (!signedXml) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNHASH_EMPTY", details: signPayload },
        { status: 502 }
      );
    }

    const signedHash = crypto.createHash("sha256").update(signedXml, "utf8").digest("base64");

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml: signedXml,
        signed_at: new Date().toISOString(),
        signed_hash: signedHash,
        error_message: null,
      })
      .eq("invoice_id", invoice_id);

    await service
      .from("digigo_sign_sessions")
      .update({ status: "done" })
      .eq("state", state);

    await service
      .from("invoices")
      .update({ signature_status: "signed", signature_provider: "digigo" })
      .eq("id", invoice_id);

    return NextResponse.json(
      { ok: true, invoice_id, state, redirect: `/invoices/${invoice_id}` },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", message: String(e?.message || e || "error") },
      { status: 500 }
    );
  }
}
