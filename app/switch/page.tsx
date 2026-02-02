import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SwitchClient from "./SwitchClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = {
  q?: string;
  type?: "all" | "company" | "group" | "cabinet";
  page?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}
function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  const x = s(v) as T;
  return allowed.includes(x) ? x : fallback;
}
function toPage(v: unknown) {
  const n = Number(s(v || "1"));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function SwitchPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const q = s(sp.q);
  const type = pick(sp.type, ["all", "company", "group", "cabinet"], "all");
  const page = toPage(sp.page);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: ms, error: msErr } = await supabase
    .from("memberships")
    .select("company_id, role, is_active, companies(id, company_name, tax_id)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (msErr) {

    console.error("Switch memberships error:", msErr.message);
  }

  const companies =
    (ms ?? [])
      .map((m: any) => ({
        id: String(m.companies?.id ?? m.company_id ?? ""),
        label: String(m.companies?.company_name ?? "Société"),
        tax_id: String(m.companies?.tax_id ?? ""),
        role: String(m.role ?? "viewer"),
        kind: "company" as const,
      }))
      .filter((x) => x.id) ?? [];

  const { data: gm, error: gmErr } = await supabase
    .from("group_members")
    .select("group_id, role, is_active, groups(id, group_name, group_type)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (gmErr) {
    console.error("Switch group_members error:", gmErr.message);
  }

  const groups =
    (gm ?? [])
      .map((m: any) => {
        const gt = String(m.groups?.group_type ?? "multi");
        const kind = gt === "cabinet" ? ("cabinet" as const) : ("group" as const);
        return {
          id: String(m.groups?.id ?? m.group_id ?? ""),
          label: String(m.groups?.group_name ?? (kind === "cabinet" ? "Cabinet" : "Groupe")),
          role: String(m.role ?? "staff"),
          kind,
        };
      })
      .filter((x) => x.id) ?? [];

  const spaces = [...companies, ...groups];

  return (
    <AppShell>
      <SwitchClient initialSpaces={spaces} initialQ={q} initialType={type} initialPage={page} />
    </AppShell>
  );
}
