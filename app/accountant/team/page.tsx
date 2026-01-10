// app/accountant/team/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import type React from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================
   UI helpers (local)
========================= */
function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold">{title}</div>
        {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  cta,
}: {
  label: string;
  value: string | number;
  hint?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-sm text-gray-500">{hint}</div> : null}
      {cta ? <div className="mt-4 flex flex-wrap gap-2">{cta}</div> : null}
    </div>
  );
}

/* =========================
   Page
========================= */
export default async function AccountantTeamPage() {
  const supabase = await createClient();

  /* ---------- Auth ---------- */
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const user = auth.user;

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.account_type !== "comptable") {
    redirect("/dashboard");
  }

  /* ---------- Cabinet (société du comptable) ---------- */
  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,created_at")
    .eq("owner_user", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = cabinetList?.[0];
  if (!cabinet) redirect("/accountant/cabinet");

  // ✅ IMPORTANT: capture des valeurs non-null pour les Server Actions
  const cabinetId = cabinet.id;
  const userId = user.id;

  /* ---------- Équipe ---------- */
  const { data: team } = await supabase
    .from("memberships")
    .select(
      `
      id,
      user_id,
      role,
      is_active,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      app_users (
        id,
        email,
        full_name
      )
    `
    )
    .eq("company_id", cabinetId)
    .order("created_at");

  /* ---------- Invitations ---------- */
  const { data: invitations } = await supabase
    .from("access_invitations")
    .select("id,invited_email,status,expires_at,token")
    .eq("company_id", cabinetId)
    .eq("status", "pending");

  /* ---------- Clients ---------- */
  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id,companies(id,company_name,tax_id)")
    .eq("user_id", userId);

  const companies =
    memberships
      ?.map((m: any) => m.companies)
      .filter((c: any) => c && c.id !== cabinetId) || [];

  /* ---------- Assignations ---------- */
  const { data: assignments } = await supabase
    .from("client_assignments")
    .select("id,company_id,staff_user_id,is_active");

  const staff =
    team
      ?.filter((m: any) => m.user_id !== userId && m.is_active)
      .map((m: any) => ({
        user_id: m.user_id,
        email: m.app_users?.email,
        full_name: m.app_users?.full_name,
      })) || [];

  /* =========================
     KPI Dashboard values
  ========================= */
  const totalTeam = (team ?? []).length;
  const activeTeam = (team ?? []).filter((m: any) => m.is_active).length;
  const activeStaffOnly = staff.length; // exclut le owner
  const pendingInv = (invitations ?? []).length;
  const totalClients = companies.length;
  const activeAssignments = (assignments ?? []).filter((a: any) => a.is_active).length;

  /* =========================
     Server Actions
  ========================= */
  async function inviteMember(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const email = String(formData.get("email") || "").toLowerCase();
    if (!email) return;

    await supabase.from("access_invitations").insert({
      company_id: cabinetId,
      invited_email: email,
      invited_by_user_id: userId,
      role: String(formData.get("role") || "staff"),
      can_manage_customers: !!formData.get("can_manage_customers"),
      can_create_invoices: !!formData.get("can_create_invoices"),
      can_validate_invoices: !!formData.get("can_validate_invoices"),
      can_submit_ttn: !!formData.get("can_submit_ttn"),
      token: crypto.randomUUID(),
    });

    redirect("/accountant/team");
  }

  async function assignClient(formData: FormData) {
    "use server";
    const supabase = await createClient();

    const companyId = String(formData.get("company_id") || "");
    const staffUserId = String(formData.get("staff_user_id") || "");
    if (!companyId || !staffUserId) return;

    await supabase.from("client_assignments").insert({
      company_id: companyId,
      staff_user_id: staffUserId,
      assigned_by: userId,
      is_active: true,
    });

    redirect("/accountant/team");
  }

  async function unassignClient(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const id = String(formData.get("assignment_id") || "");
    if (!id) return;

    await supabase
      .from("client_assignments")
      .update({ is_active: false })
      .eq("id", id);

    redirect("/accountant/team");
  }

  /* =========================
     Render (WITH SIDEBAR)
  ========================= */
  return (
    <AppShell
      title="Équipe du cabinet"
      subtitle="Invitations, permissions et assignations des clients"
      accountType={profile.account_type as any}
    >
      <div className="ftn-grid">
        {/* top right actions */}
        <div className="flex items-center justify-between gap-3">
          <div />
          <div className="flex gap-2">
            <Link className="rounded-xl border px-3 py-2 text-sm" href="/accountant/clients">
              Mes clients
            </Link>
            <Link className="rounded-xl border px-3 py-2 text-sm" href="/accountant/dashboard">
              Dashboard
            </Link>
          </div>
        </div>

        {/* ===== Dashboard KPI ===== */}
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Membres actifs" value={activeTeam} hint={`Total: ${totalTeam}`} />
          <StatCard label="Assistants actifs" value={activeStaffOnly} hint="Sans le comptable" />
          <StatCard
            label="Invitations en attente"
            value={pendingInv}
            hint="Accès envoyés non acceptés"
            cta={
              <Link className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" href="/accountant/invitations">
                Voir invitations
              </Link>
            }
          />
          <StatCard
            label="Assignations actives"
            value={activeAssignments}
            hint={`Clients: ${totalClients}`}
            cta={
              <Link className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" href="/accountant/clients">
                Voir clients
              </Link>
            }
          />
        </div>

        {/* INVITER */}
        <Card
          title="Inviter un membre"
          subtitle="Ajouter un aide-comptable et définir ses permissions"
        >
          <form action={inviteMember} className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className="text-sm">Email</label>
              <input
                name="email"
                required
                type="email"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm">Rôle</label>
              <select name="role" className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="staff">Assistant</option>
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div className="md:col-span-5 flex flex-wrap items-end gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="can_manage_customers" /> Gérer clients
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="can_create_invoices" /> Créer factures
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="can_validate_invoices" /> Valider
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="can_submit_ttn" /> TTN
              </label>
            </div>

            <div className="md:col-span-1 flex items-end">
              <button className="w-full rounded-xl bg-black px-3 py-2 text-sm text-white">
                Inviter
              </button>
            </div>
          </form>
        </Card>

        {/* ASSIGNATION */}
        <Card title="Assignation des clients" subtitle="Choisir qui gère quel client (qui fait quoi)">
          {companies.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun client disponible.</div>
          ) : (
            <>
              <form action={assignClient} className="mb-4 grid gap-3 md:grid-cols-12">
                <div className="md:col-span-5">
                  <select name="company_id" className="w-full rounded-xl border px-3 py-2 text-sm">
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} {c.tax_id ? `— MF ${c.tax_id}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-5">
                  <select
                    name="staff_user_id"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    {staff.map((s: any) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name || s.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <button className="w-full rounded-xl bg-black px-3 py-2 text-sm text-white">
                    Assigner
                  </button>
                </div>
              </form>

              {(assignments ?? [])
                .filter((a: any) => a.is_active)
                .map((a: any) => {
                  const company = companies.find((c: any) => c.id === a.company_id);
                  const member = staff.find((s: any) => s.user_id === a.staff_user_id);

                  return (
                    <div
                      key={a.id}
                      className="mb-2 flex items-center justify-between rounded-xl border p-3"
                    >
                      <div>
                        <div className="font-medium">{company?.company_name}</div>
                        <div className="text-xs text-gray-500">{member?.email}</div>
                        <div className="mt-1 flex gap-2">
                          <Badge>Client</Badge>
                          <Badge>{member?.full_name ? "Nom OK" : "Email"}</Badge>
                        </div>
                      </div>

                      <form action={unassignClient}>
                        <input type="hidden" name="assignment_id" value={a.id} />
                        <button className="rounded-xl border px-3 py-1.5 text-xs">
                          Retirer
                        </button>
                      </form>
                    </div>
                  );
                })}
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
