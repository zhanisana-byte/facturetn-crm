import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ActiveMode } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
type Payload = {
  mode: ActiveMode;
  company_id?: string | null;
  group_id?: string | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body?.mode;
  if (!mode || !["profil", "entreprise", "comptable", "multi_societe"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const active_company_id = body.company_id ?? null;
  const active_group_id = body.group_id ?? null;

  const { error } = await supabase.from("user_workspace").upsert(
    {
      user_id: auth.user.id,
      active_mode: mode,
      active_company_id,
      active_group_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
