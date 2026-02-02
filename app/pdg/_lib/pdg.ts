import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEFAULT_PDG_EMAIL = "zhanisana@gmail.com";

export async function requirePdg() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const email = (auth.user.email || "").toLowerCase();
  const allowed = (process.env.PLATFORM_PDG_EMAIL || DEFAULT_PDG_EMAIL).toLowerCase();
  if (email !== allowed) {
    
    const svc = createServiceClient();
    const { data } = await svc
      .from("app_users")
      .select("id,is_platform_pdg")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!data?.is_platform_pdg) redirect("/dashboard");
  }

  return { authUser: auth.user, service: createServiceClient(), isPdg: true };
}

export function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function weekKey(d: Date) {
  
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
