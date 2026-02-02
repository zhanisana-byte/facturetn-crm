import type { SidebarItem } from "./types";
import type { AccountType } from "@/app/types";

export type ActivePage =
  | { type: "profile"; id?: string }
  | { type: "invoices"; id?: string }
  | { type: "recurring"; id?: string }
  | { type: "declarations"; id?: string }
  | { type: "pages"; id?: string }
  | { type: "pdg"; id?: string }
  | { type: "accountant"; id?: string }
  | { type: "cabinet"; id?: string }
  | { type: "company"; id: string }
  | { type: "group"; id: string }
  | { type: "switch"; id?: string }
  | null;

export type PageType =
  | "profile"
  | "invoices"
  | "recurring"
  | "declarations"
  | "pages"
  | "pdg"
  | "accountant"
  | "cabinet"
  | "company"
  | "group"
  | "switch";

export function getSidebarItems({
  accountType,
  pathname,
  activeCompanyId,
  activeGroupId,
  isPdg,
}: {
  accountType: AccountType;
  pathname: string;
  activeCompanyId?: string | null;
  activeGroupId?: string | null;
  isPdg?: boolean;
}): SidebarItem[] {
  
  if (isPdg) {
    return [
      { kind: "title", key: "pdg", label: "PDG" },

      { kind: "link", key: "pdg_dash", label: "Dashboard", href: "/pdg", icon: "dashboard" },
      { kind: "link", key: "pdg_users", label: "Utilisateurs", href: "/pdg/users", icon: "users" },
      { kind: "link", key: "pdg_companies", label: "Sociétés", href: "/pdg/companies", icon: "company" },
      { kind: "link", key: "pdg_groups", label: "Groupes", href: "/pdg/groups", icon: "companies" },
      { kind: "link", key: "pdg_cabinets", label: "Cabinets", href: "/pdg/cabinets", icon: "cabinet" },
      { kind: "link", key: "pdg_subs", label: "Abonnements", href: "/pdg/subscriptions", icon: "subscription" },
      { kind: "link", key: "pdg_payments", label: "Paiements", href: "/pdg/payments", icon: "billing" },

      { kind: "divider", key: "pdg_div" },
      { kind: "link", key: "pdg_switch", label: "Switch", href: "/switch", icon: "switch" },
    ];
  }

  if (accountType === "profil") {
    return [
      { kind: "title", key: "p", label: "Profil" },

      { kind: "link", key: "p_dash", label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { kind: "link", key: "p_settings", label: "Paramètres", href: "/profile/settings", icon: "settings" },
      { kind: "link", key: "p_create", label: "Créer une page", href: "/pages/new", icon: "create" },
      { kind: "link", key: "p_entities", label: "Mes entités", href: "/pages", icon: "entities" },
      { kind: "link", key: "p_invit", label: "Invitations", href: "/invitations", icon: "invitations" },
      { kind: "link", key: "p_invoices", label: "Factures", href: "/invoices", icon: "invoices" },
      { kind: "link", key: "p_recurring", label: "Factures récurrentes", href: "/recurring", icon: "recurring" },
      { kind: "link", key: "p_decl", label: "Déclarations", href: "/declarations", icon: "declarations" },

      { kind: "divider", key: "p_div" },
      { kind: "link", key: "p_switch", label: "Switch", href: "/switch", icon: "switch" },
    ];
  }

  if (accountType === "comptable") {
    return [
      { kind: "title", key: "c", label: "Cabinet" },

      { kind: "link", key: "c_dash", label: "Dashboard", href: "/accountant", icon: "dashboard" },
      { kind: "link", key: "c_profile", label: "Mon cabinet", href: "/accountant/cabinet", icon: "cabinet" },

      {
        kind: "link",
        key: "c_company_inv",
        label: "Invitations sociétés",
        href: "/accountant/company-invitations",
        icon: "invitations",
      },
      {
        kind: "link",
        key: "c_invit",
        label: "Invitations équipe",
        href: "/accountant/invitations",
        icon: "invitations",
      },

      { kind: "link", key: "c_team", label: "Équipe & permissions", href: "/accountant/team", icon: "team" },
      { kind: "link", key: "c_sub", label: "Abonnement", href: "/accountant/subscription", icon: "subscription" },

      { kind: "divider", key: "c_div" },
      { kind: "link", key: "c_switch", label: "Switch", href: "/switch", icon: "switch" },
    ];
  }

  if (accountType === "entreprise" && activeCompanyId) {
    const base = `/companies/${activeCompanyId}`;

    return [
      { kind: "title", key: "s", label: "Société" },

      { kind: "link", key: "s_dash", label: "Dashboard", href: base, icon: "dashboard" },

      { kind: "link", key: "s_profile", label: "Ma société", href: `/companies/edit/${activeCompanyId}`, icon: "company" },

      { kind: "link", key: "s_ttn", label: "Paramètres TTN", href: `${base}/ttn`, icon: "ttn" },
      { kind: "link", key: "s_team", label: "Équipe & permissions", href: `${base}/droits`, icon: "team" },
      { kind: "link", key: "s_inv", label: "Invitations", href: `${base}/invitations`, icon: "invitations" },
      { kind: "link", key: "s_links", label: "Cabinet / Groupe liés", href: `${base}/links`, icon: "entities" },
      { kind: "link", key: "s_sub", label: "Abonnement", href: `${base}/subscription`, icon: "subscription" },

      { kind: "divider", key: "s_div" },
      { kind: "link", key: "s_switch", label: "Switch", href: "/switch", icon: "switch" },
    ];
  }

  if (accountType === "multi_societe" && activeGroupId) {
    const base = `/groups/${activeGroupId}`;

    return [
      { kind: "title", key: "g", label: "Groupe" },

      { kind: "link", key: "g_dash", label: "Dashboard", href: base, icon: "dashboard" },
      { kind: "link", key: "g_profile", label: "Profil du groupe", href: `${base}/profile`, icon: "settings" },

      { kind: "link", key: "g_companies", label: "Mes sociétés", href: `${base}/clients`, icon: "companies" },
      { kind: "link", key: "g_ttn", label: "Paramètres TTN", href: `${base}/ttn`, icon: "ttn" },

      { kind: "link", key: "g_inv_team", label: "Inviter l’équipe", href: `${base}/invitations`, icon: "invitations" },
      { kind: "link", key: "g_inv_received", label: "Invitations reçues (sociétés)", href: `${base}/invitations-received`, icon: "mail" },

      { kind: "link", key: "g_team", label: "Équipe & permissions", href: `${base}/droits`, icon: "team" },
      { kind: "link", key: "g_sub", label: "Abonnement", href: `${base}/subscription`, icon: "subscription" },

      { kind: "divider", key: "g_div" },
      { kind: "link", key: "g_switch", label: "Switch", href: "/switch", icon: "switch" },
    ];
  }

  return [{ kind: "link", key: "fallback_switch", label: "Switch", href: "/switch", icon: "switch" }];
}
