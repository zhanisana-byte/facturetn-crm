import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  group_id: string;
  email?: string;
  name?: string;
  permissions?: string[];
};

function getOriginFromReq(req: Request) {
  const h = req.headers;
  const xfProto = h.get("x-forwarded-proto");
  const xfHost = h.get("x-forwarded-host");
  const host = h.get("host");
  const proto = xfProto ? xfProto.split(",")[0].trim() : "https";
  const finalHost = (xfHost ? xfHost.split(",")[0].trim() : host)?.trim();
  return finalHost ? `${proto}://${finalHost}` : "";
}

function normalizeBaseUrl(raw: string) {
  const v = (raw || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const group_id = String(body.group_id || "").trim();
  if (!group_id) {
    return NextResponse.json({ error: "group_id is required" }, { status: 400 });
  }

  const permissions = Array.isArray(body.permissions) ? body.permissions.map(String) : [];

  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from("group_invitations")
    .insert({
      group_id,
      created_by: auth.user.id,
      token,
      email: body.email ? String(body.email).trim().toLowerCase() : null,
      name: body.name ? String(body.name).trim() : null,
      permissions,
      status: "pending",
    })
    .select("id, token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const originFromReq = getOriginFromReq(req);
  const base =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL || "") ||
    normalizeBaseUrl(originFromReq) ||
    "";

  const inviteLink = `${base}/groups/${group_id}/invitations?token=${encodeURIComponent(data.token)}`;

  return NextResponse.json({
    ok: true,
    id: data.id,
    token: data.token,
    inviteLink,
  });
}
