// app/recap/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

type MembershipRow = {
  id: string;
  role: string | null;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  is_active: boolean;
  company?: { id: string; company_name: string | null } | null;
  user?: { id: string; full_name: string | null; email: string | null } | null;
};

function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning" | "success" | "info" | "danger";
  children: React.ReactNode;
}) {
  return <span className={cn("ftn-pill", `ftn-pill-${tone}`)}>{children}</span>;
}

function LuxCard({
  title,
  subtitle,
  right,
  children,
  delay = 0,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="ftn-card-head">
        <div className="ftn-card-titleRow">
          {icon ? <div className="ftn-ic">{icon}</div> : null}
          <div>
            <div className="ftn-card-title">{title}</div>
            {subtitle ? <div className="ftn-card-sub">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="ftn-card-right">{right}</div> : null}
      </div>
      <div className="ftn-card-body">{children}</div>
      <div className="ftn-card-glow" aria-hidden="true" />
    </div>
  );
}

function permPills(r: MembershipRow) {
  const pills: Array<{ ok: boolean; label: string }> = [
    { ok: !!r.can_manage_customers, label: "Clients" },
    { ok: !!r.can_create_invoices, label: "Créer factures" },
    { ok: !!r.can_validate_invoices, label: "Valider" },
    { ok: !!r.can_submit_ttn, label: "Envoyer TTN" },
  ];
  return (
    <div className="ftn-pillrow">
      {pills.map((p) => (
        <Pill key={p.label} tone={p.ok ? "success" : "neutral"}>
          {p.ok ? "✅" : "—"} {p.label}
        </Pill>
      ))}
    </div>
  );
}

function roleBadge(role: string | null) {
  const r = (role || "viewer").toLowerCase();
  if (r.includes("owner")) return <Pill tone="info">👑 Owner</Pill>;
  if (r.includes("accountant")) return <Pill tone="info">🧾 Comptable</Pill>;
  if (r.includes("staff")) return <Pill tone="neutral">👥 Équipe</Pill>;
  if (r.includes("editor")) return <Pill tone="neutral">✍️ Éditeur</Pill>;
  return <Pill tone="neutral">👁️ Viewer</Pill>;
}

export default async function RecapPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: me } = await supabase
    .from("app_users")
    .select("id, account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  const accountType = (me?.account_type || "client") as any;

  // Récap = memberships visibles selon l’utilisateur.
  // (Simple: on liste les memberships de l’utilisateur + celles des sociétés qu’il gère via owner/membership.
  // Si tu veux filtrer plus strictement, on le fera ensuite.)
  const { data, error } = await supabase
    .from("memberships")
    .select(
      [
        "id",
        "role",
        "can_manage_customers",
        "can_create_invoices",
        "can_validate_invoices",
        "can_submit_ttn",
        "is_active",
        "company:companies(id, company_name)",
        "user:app_users(id, full_name, email)",
      ].join(",")
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const rows = (data as unknown as MembershipRow[]) || [];

  const byCompany = rows.reduce<Record<string, MembershipRow[]>>((acc, r) => {
    const key = r.company?.id || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const companyBlocks = Object.entries(byCompany).map(([companyId, list]) => {
    const companyName = list[0]?.company?.company_name || "Société";
    return { companyId, companyName, list };
  });

  return (
    <AppShell
      title="Récap"
      subtitle="Qui gère quoi (rôles & permissions) — même design premium que le dashboard."
      accountType={accountType}
    >
      <style>{`
/* =========================================================
   RECAP — LUXE (match dashboard)
========================================================= */
.ftn-wrap{ display:flex; flex-direction:column; gap:18px; }

/* HERO */
.ftn-hero{
  border-radius: 26px;
  padding: 22px 22px;
  background:
    radial-gradient(1200px 400px at 10% 0%, rgba(186,134,52,.18), transparent 55%),
    radial-gradient(900px 300px at 85% 30%, rgba(126,231,205,.10), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.72));
  border: 1px solid rgba(148,163,184,.26);
  box-shadow: 0 18px 55px rgba(2,6,23,.10);
  position: relative;
  overflow:hidden;
}
.ftn-heroTop{
  position: relative;
  display:flex; gap:14px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;
}
.ftn-heroTitle{
  font-size: 34px; line-height: 1.1; font-weight: 850; letter-spacing: -0.02em;
  color: var(--ink, #0b1220);
  margin: 0;
}
.ftn-heroSub{
  margin-top: 8px;
  color: rgba(102,112,133,.95);
  font-size: 14.5px;
  max-width: 820px;
}
.ftn-heroBadgeRow{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top: 12px; }

/* Grid */
.ftn-grid2{
  display:grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap:14px;
}
@media (max-width: 980px){
  .ftn-grid2{ grid-template-columns: 1fr; }
  .ftn-heroTitle{ font-size: 28px; }
}

/* Card luxe */
.ftn-card-lux{
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.72));
  border: 1px solid rgba(148,163,184,.26);
  box-shadow: 0 14px 45px rgba(2,6,23,.08);
  position: relative;
  overflow:hidden;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.ftn-card-glow{
  position:absolute;
  inset:-120px -120px auto auto;
  width: 220px; height: 220px;
  background: radial-gradient(circle at 30% 30%, rgba(186,134,52,.22), transparent 60%);
  filter: blur(2px);
  opacity:.85;
  pointer-events:none;
}
.ftn-card-lux:hover{
  border-color: rgba(186,134,52,.30);
  box-shadow: 0 18px 60px rgba(2,6,23,.12);
  transform: translateY(-2px);
}
.ftn-card-head{
  display:flex; justify-content:space-between; align-items:flex-start; gap:10px;
  padding: 16px 16px 10px 16px;
}
.ftn-card-titleRow{ display:flex; gap:10px; align-items:flex-start; }
.ftn-ic{
  width: 38px; height: 38px; border-radius: 14px;
  background: rgba(186,134,52,.12);
  border: 1px solid rgba(186,134,52,.25);
  display:flex; align-items:center; justify-content:center;
  flex:0 0 auto;
}
.ftn-card-title{ font-weight: 780; letter-spacing: -0.01em; font-size: 16px; color: var(--ink, #0b1220); }
.ftn-card-sub{ font-size: 12.5px; color: rgba(102,112,133,.95); margin-top: 2px; }
.ftn-card-right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ftn-card-body{ padding: 0 16px 16px 16px; color: rgba(11,18,32,.92); }

/* Reveal */
.ftn-reveal{
  opacity: 0;
  transform: translateY(10px) scale(.99);
  animation: ftn-reveal .55s cubic-bezier(.2,.8,.2,1) forwards;
}
@keyframes ftn-reveal{ to{ opacity:1; transform: translateY(0) scale(1);} }

/* Pills */
.ftn-pill{
  display:inline-flex; align-items:center; gap:6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(148,163,184,.28);
  background: rgba(255,255,255,.55);
  color: rgba(11,18,32,.88);
  white-space:nowrap;
}
.ftn-pill-success{
  border-color: rgba(16,185,129,.30);
  background: rgba(16,185,129,.10);
  color: rgba(6,95,70,.95);
}
.ftn-pill-info{
  border-color: rgba(59,130,246,.25);
  background: rgba(59,130,246,.10);
  color: rgba(30,64,175,.95);
}
.ftn-pill-warning{
  border-color: rgba(245,158,11,.30);
  background: rgba(245,158,11,.10);
  color: rgba(120,53,15,.95);
}
.ftn-pill-danger{
  border-color: rgba(239,68,68,.25);
  background: rgba(239,68,68,.10);
  color: rgba(153,27,27,.95);
}

.ftn-pillrow{ display:flex; gap:8px; flex-wrap:wrap; margin-top: 10px; }

.ftn-row{
  display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(255,255,255,.55);
}
.ftn-who{ display:flex; flex-direction:column; gap:2px; }
.ftn-name{ font-weight: 850; color: rgba(11,18,32,.92); font-size: 13.5px; }
.ftn-mail{ color: rgba(102,112,133,.98); font-size: 12.5px; }
.ftn-empty{
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(255,255,255,.55);
  color: rgba(102,112,133,.98);
  font-size: 13.5px;
}
      `}</style>

      <div className="ftn-wrap">
        <div className="ftn-hero ftn-reveal" style={{ animationDelay: "0ms" }}>
          <div className="ftn-heroTop">
            <div>
              <h1 className="ftn-heroTitle">Récap — Permissions</h1>
              <div className="ftn-heroSub">
                Liste des personnes qui travaillent sur vos sociétés, avec leurs droits (clients, factures, validation,
                TTN). Même style premium que ton dashboard.
              </div>
              <div className="ftn-heroBadgeRow">
                <Pill tone="info">🔐 Rôles & permissions</Pill>
                <Pill tone={error ? "danger" : "success"}>{error ? "⚠️ Erreur chargement" : `✅ ${rows.length} accès actifs`}</Pill>
              </div>
            </div>

            <div className="ftn-heroBadgeRow">
              <Pill tone="warning">Astuce : “Récap” = page de contrôle (révocation ensuite).</Pill>
            </div>
          </div>
        </div>

        {error ? (
          <div className="ftn-empty">{error.message}</div>
        ) : companyBlocks.length === 0 ? (
          <div className="ftn-empty">Aucun accès actif pour le moment.</div>
        ) : (
          <div className="ftn-grid2">
            {companyBlocks.map((block, i) => (
              <LuxCard
                key={block.companyId}
                title={block.companyName || "Société"}
                subtitle="Personnes + rôles + permissions"
                icon={<span>🏢</span>}
                right={<Pill tone="neutral">{block.list.length} membre(s)</Pill>}
                delay={80 + i * 60}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {block.list.map((r) => {
                    const person = r.user?.full_name?.trim() || r.user?.email || "Utilisateur";
                    const mail = r.user?.email || "—";
                    return (
                      <div key={r.id} className="ftn-row">
                        <div className="ftn-who">
                          <div className="ftn-name">{person}</div>
                          <div className="ftn-mail">{mail}</div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {roleBadge(r.role)}
                          <Pill tone={r.is_active ? "success" : "danger"}>{r.is_active ? "✅ Actif" : "⛔ Inactif"}</Pill>
                        </div>

                        <div style={{ width: "100%" }}>{permPills(r)}</div>
                      </div>
                    );
                  })}
                </div>
              </LuxCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
