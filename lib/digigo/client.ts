"use client";

function s(v: any) {
  return String(v ?? "").trim();
}

async function readJsonOrText(res: Response) {
  const txt = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }
  return { j, txt };
}

export type DigigoStartResponse =
  | { ok: true; authorize_url: string; state: string; invoice_id?: string; redirect?: string }
  | { ok: false; error: string; message?: string; details?: any };

export async function digigoStart(args: {
  invoice_id: string;
  back_url?: string;
  environment?: "test" | "production";
}): Promise<DigigoStartResponse> {
  const res = await fetch("/api/digigo/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      invoice_id: s(args.invoice_id),
      back_url: s(args.back_url || ""),
      environment: s(args.environment || ""),
    }),
  });

  const { j, txt } = await readJsonOrText(res);

  if (!res.ok || !j?.ok) {
    return {
      ok: false,
      error: s(j?.error || `HTTP_${res.status}`),
      message: s(j?.message || txt || ""),
      details: j?.details,
    };
  }

  return {
    ok: true,
    authorize_url: s(j?.authorize_url || ""),
    state: s(j?.state || ""),
    invoice_id: s(j?.invoice_id || ""),
    redirect: s(j?.redirect || ""),
  };
}

export function digigoRedirectToAuthorize(authorizeUrl: string) {
  const url = s(authorizeUrl);
  if (!url) throw new Error("AUTHORIZE_URL_MISSING");
  window.location.assign(url);
}

function ssSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(key, value);
  } catch {}
}

export async function digigoStartAndRedirect(args: {
  invoice_id: string;
  back_url?: string;
  environment?: "test" | "production";
}) {
  const r = await digigoStart(args);
  if (!r.ok) return r;

  ssSet("digigo_invoice_id", s(args.invoice_id));
  ssSet("digigo_back_url", s(args.back_url || ""));
  ssSet("digigo_state", s((r as any).state || ""));

  digigoRedirectToAuthorize(r.authorize_url);
  return r;
}

export function digigoParseRedirectParams(input?: { search?: string; hash?: string }) {
  const search = typeof input?.search === "string" ? input.search : window.location.search || "";
  const hash = typeof input?.hash === "string" ? input.hash : window.location.hash || "";

  const qs = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hs = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const token = s(qs.get("token") || hs.get("token") || qs.get("access_token") || hs.get("access_token") || "");
  const code = s(qs.get("code") || hs.get("code") || "");
  const state = s(qs.get("state") || hs.get("state") || "");
  const invoice_id = s(qs.get("invoice_id") || hs.get("invoice_id") || "");
  const back_url = s(qs.get("back_url") || hs.get("back_url") || qs.get("back") || hs.get("back") || "");

  return { token, code, state, invoice_id, back_url };
}

export type DigigoConfirmResponse =
  | { ok: true; redirect?: string }
  | { ok: false; error: string; message?: string; details?: any };

export async function digigoConfirm(args: {
  token?: string;
  code?: string;
  state?: string;
  invoice_id?: string;
  back_url?: string;
}) {
  const res = await fetch("/api/digigo/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      token: s(args.token || ""),
      code: s(args.code || ""),
      state: s(args.state || ""),
      invoice_id: s(args.invoice_id || ""),
      back_url: s(args.back_url || ""),
    }),
  });

  const { j, txt } = await readJsonOrText(res);

  if (!res.ok || !j?.ok) {
    return {
      ok: false,
      error: s(j?.error || `HTTP_${res.status}`),
      message: s(j?.message || txt || ""),
      details: j?.details,
    };
  }

  return { ok: true, redirect: s(j?.redirect || "") };
}
