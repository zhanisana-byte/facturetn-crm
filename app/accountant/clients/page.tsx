// app/accountant/clients/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { mapDbAccountType } from "@/app/types";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClientCompany = {
  id: string;
  company_name: string;
  tax_id: string | null;
  owner_user_id_id: string | null;
};

type MembershipRow = {
  company_id: string;
  role: string;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  companies: ClientCompany | null;
};

type ClientRow = {
  id: string; // company id
  name: string;
  mf: string;
  perms: {
    can_manage_customers: boolean;
    can_create_invoices: boolean;
    can_validate_invoices: boolean;
    can_submit_ttn: boolean;
  };
  role: string;
  subscription_status?: string | null;
};

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold">{title}</div>
        {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
      </div>
      {children}
    </div>
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
  cta?: ReactNode;
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

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-gray-700">
      {children}
    </span>
  );
}

function permLabel(key: keyof ClientRow["perms"]) {
  switch (key) {
    case "can_manage_customers":
      return "M";
    case "can_create_invoices":
      return "C";
    case "can_validate_invoices":
      return "V";
    case "can_submit_ttn":
      return "T";
    default:
      return "?";
  }
}

export default async function AccountantClientsPage() {
  const supabase = await createClient();

  // Auth
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/login");

  // Profile
  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");
  if (profile.account_type !== "comptable") redirect("/dashboard");

  // Get cabinet company (owned by this comptable)
  const { data: cabinetListRaw } = await supabase
    .from("companies")
    .select("id,company_name,owner_user_id_id,created_at")
    .eq("owner_user_id_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinetList = cabinetListRaw ?? [];

  const cabinet = cabinetList[0];
  if (!cabinet) redirect("/accountant/cabinet");

  // All companies the comptable has access to via memberships
  const { data: membershipRowsRaw, error: membershipsErr } = await supabase
    .from("memberships")
    .select(
      `
      company_id,
      role,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      companies:companies (
        id,
        company_name,
        tax_id,
        owner_user_id
      )
    `
    )
    .eq("user_id", user.id);

  // ✅ Sidebar + Error display
  if (membershipsErr) {
    return (
      <AppShell
        title="Mes clients"
        subtitle="Liste des sociétés accessibles depuis votre cabinet."
        accountType={mapDbAccountType(profile.account_type)}
      >
        <Card title="Mes clients" subtitle="Erreur de chargement des clients.">
          <div className="text-sm text-red-600">{membershipsErr.message}</div>
        </Card>
      </AppShell>
    );
  }

  const membershipRows = (membershipRowsRaw ?? []) as unknown as MembershipRow[];

  // Filter out cabinet itself; keep only real client companies
  const rows: ClientRow[] = membershipRows
    .filter((m) => m.companies && m.companies.id !== cabinet.id)
    .map((m) => {
      const c = m.companies!;
      return {
        id: c.id,
        name: c.company_name,
        mf: c.tax_id ?? "",
        role: m.role,
        perms: {
          can_manage_customers: !!m.can_manage_customers,
          can_create_invoices: !!m.can_create_invoices,
          can_validate_invoices: !!m.can_validate_invoices,
          can_submit_ttn: !!m.can_submit_ttn,
        },
      };
    });

  // ===== DASHBOARD KPIs =====
  const totalClients = rows.length;
  const ttnEnabled = rows.filter((r) => r.perms.can_submit_ttn).length;
  const canValidate = rows.filter((r) => r.perms.can_validate_invoices).length;

  // Invitations pending (tolerant)
  let pendingInvitations = 0;
  const { data: invRows, error: invErr } = await supabase
    .from("access_invitations")
    .select("id")
    .eq("company_id", cabinet.id)
    .eq("status", "pending");

  if (!invErr) pendingInvitations = (invRows ?? []).length;

  // ✅ Sidebar enabled via AppShell
  return (
    <AppShell
      title="Mes clients"
      subtitle="Liste des sociétés accessibles depuis votre cabinet."
      accountType={mapDbAccountType(profile.account_type)}
    >
      <div className="ftn-grid">
        {/* Header (buttons right) */}
        <div className="flex items-start justify-between gap-4">
          <div />
          <div className="flex gap-2">
            <Link
              href="/accountant/team"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Équipe & assignations
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* ===== Dashboard section ===== */}
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="Total clients"
            value={totalClients}
            hint="Sociétés accessibles (hors cabinet)"
            cta={
              <Link
                href="/accountant/team"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Gérer équipe
              </Link>
            }
          />

          <StatCard
            label="Clients avec TTN"
            value={ttnEnabled}
            hint={`Perm TTN active (T:ON) · Validation: ${canValidate}`}
            cta={
              <Link
                href="/accountant/clients"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Voir clients
              </Link>
            }
          />

          <StatCard
            label="Invitations en attente"
            value={pendingInvitations}
            hint="Accès envoyés en attente d’acceptation"
            cta={
              <Link
                href="/accountant/team"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Voir invitations
              </Link>
            }
          />
        </div>

        {/* ===== List ===== */}
        <Card
          title="Clients"
          subtitle="Vous pouvez ouvrir une société, voir les factures, et accéder au TTN selon vos permissions."
        >
          {rows.length === 0 ? (
            <div className="text-sm text-gray-500">
              Aucun client pour le moment. Ajoutez un accès via{" "}
              <Link href="/access" className="underline">
                Invitations / Accès
              </Link>
              .
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {rows.map((r: ClientRow) => (
                <div key={r.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{r.name}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        {r.mf ? <Badge>MF: {r.mf}</Badge> : <Badge>MF: —</Badge>}{" "}
                        <Badge>{r.role}</Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {(Object.keys(r.perms) as Array<keyof ClientRow["perms"]>).map((k) => (
                          <Badge key={k}>
                            {permLabel(k)}:{r.perms[k] ? "ON" : "OFF"}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/companies/${r.id}`}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Ouvrir
                      </Link>
                      <Link
                        href={`/companies/${r.id}/ttn`}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        TTN
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
