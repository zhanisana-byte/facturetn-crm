import type { AccountType } from "@/app/types";

export type PageType = "cabinet" | "group" | "company";

export type ActivePage =
  | { id: string; type: PageType; role?: "owner" | "admin" | "member" | "viewer" }
  | null;

export type SidebarItem =
  | { kind: "link"; key: string; label: string; href: string; badge?: string; exact?: boolean }
  | { kind: "divider"; key: string }
  | { kind: "title"; key: string; label: string };

export type SidebarContext = {
  accountType: AccountType; // profil | entreprise | comptable | multi_societe
  activePage: ActivePage;

  activeCompanyId?: string | null;
  activeGroupId?: string | null;

  hasPagesToSwitch: boolean;

  isPdg?: boolean;
};

const L = (key: string, label: string, href: string, badge?: string, exact?: boolean): SidebarItem => ({
  kind: "link",
  key,
  label,
  href,
  badge,
  exact,
});
const T = (key: string, label: string): SidebarItem => ({ kind: "title", key, label });
const D = (key: string): SidebarItem => ({ kind: "divider", key });

export function getSidebarItems(ctx: SidebarContext): SidebarItem[] {
  const { accountType, hasPagesToSwitch, activePage } = ctx;
  const isPdg = ctx.isPdg ?? false;

  const activeCompanyId = ctx.activeCompanyId ?? null;
  const activeGroupId = ctx.activeGroupId ?? null;

  // =========================
  // CABINET (workspace comptable)
  // =========================
  if (accountType === "comptable") {
    return [
      T("cabinet_title", "Cabinet"),
      L("cabinet_dashboard", "Dashboard", "/accountant/cabinet", undefined, true),
      L("cabinet_profile", "Mon cabinet", "/accountant/profile"),
      L("cabinet_companies", "Mes sociétés", "/accountant/clients"),
      L("cabinet_perm", "Accès & permissions", "/accountant/permissions"),
      L("cabinet_roles", "Rôles", "/accountant/roles"),
      L("cabinet_inv", "Invitations", "/accountant/team"),
      L("cabinet_sub", "Abonnement", "/subscription", "Gratuit"),
      D("cabinet_div1"),
      L("cabinet_switch", "Switch", "/switch"),
    ];
  }

  // =========================
  // GROUPE (workspace multi_societe)
  // =========================
  if (accountType === "multi_societe") {
    const groupId = activeGroupId ?? (activePage?.type === "group" ? activePage.id : null);

    return [
      T("group_title", "Groupe"),
      L("group_home", "Dashboard", groupId ? `/groups/${groupId}` : "/groups/select", undefined, true),
      L("group_profile", "Profil Groupe", groupId ? `/groups/${groupId}/profile` : "/groups/select"),
      L("group_companies", "Mes sociétés", groupId ? `/groups/${groupId}/clients` : "/groups/select"),
      L("group_access", "Accès & permissions", groupId ? `/groups/${groupId}/droits` : "/groups/select"),
      L("group_inv", "Invitations", "/groups/invitations"),
      L("group_sub", "Abonnement", "/subscription", "Gratuit"),
      D("group_div1"),
      L("group_switch", "Switch", "/switch"),
    ];
  }

  // =========================
  // PROFIL (workspace profil)
  // =========================
  if (accountType === "profil") {
    const items: SidebarItem[] = [
      T("pro_title", "Profil"),
      L("pro_dashboard", "Dashboard", "/dashboard", undefined, true),
      L("pro_pages_new", "Création de page", "/pages/new"),
      L("pro_invoices", "Factures", "/invoices"),
      L("pro_recurring", "Facture permanente", "/recurring"),
      // Historique: la route s'appelle /clients mais le libellé business = Mes sociétés
      L("pro_companies", "Mes sociétés", "/clients"),
      L("pro_invitations", "Invitations reçues", "/invitations"),
      L("pro_roles", "Rôles & pages", "/roles"),
      L("pro_help", "Aide & Support", "/help"),
      D("pro_div1"),
      L("pro_switch", "Switch", "/switch", hasPagesToSwitch ? undefined : "Créer une page"),
    ];

    if (isPdg) {
      items.push(D("pdg_div"));
      items.push(T("pdg_title", "PDG (CRM)"));
      items.push(L("pdg_home", "Dashboard PDG", "/pdg", undefined, true));
      items.push(L("pdg_users", "Inscrits", "/pdg/users"));
      items.push(L("pdg_subs", "Abonnements", "/pdg/subscriptions"));
      items.push(L("pdg_payments", "Paiements", "/pdg/payments"));
      items.push(L("pdg_reports", "Rapports", "/pdg/reports"));
    }

    return items;
  }

  // =========================
  // SOCIÉTÉ (workspace entreprise)
  // =========================
  const companyId = activeCompanyId ?? (activePage?.type === "company" ? activePage.id : null);
  const companyHome = companyId ? `/companies/${companyId}` : "/companies";
  // If no active company is selected, send the user to Switch (single source of truth).
  const ttnHref = companyId ? `/companies/${companyId}/ttn` : "/switch";

  return [
    T("co_title", "Société"),
    L("co_home", "Dashboard", companyHome, undefined, true),
    L("co_profile", "Ma société", companyId ? `/companies/edit/${companyId}` : "/switch"),
    // Dans ce ZIP: les droits/roles sont gérés dans /droits (avec des tabs).
    L("co_permissions", "Accès & permissions", companyId ? `/companies/${companyId}/droits?tab=permissions` : "/switch"),
    L("co_roles", "Rôles", companyId ? `/companies/${companyId}/droits?tab=roles` : "/switch"),
    L("co_invitations", "Invitations", companyId ? `/companies/${companyId}/invitations` : "/switch"),
    L("co_ttn", "Paramètres TTN", ttnHref),
    L("co_sub", "Abonnement", "/subscription", "Gratuit"),
    D("co_div1"),
    L("co_switch", "Switch", "/switch"),
  ];
}
