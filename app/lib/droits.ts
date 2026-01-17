// ✅ Aligné avec DB ActiveMode
export type PageType = "comptable" | "multi_societe" | "entreprise";
export type PageRole = "owner" | "admin" | "member" | "viewer";

export type Droit =
  | "manage_members"
  | "invite_members"
  | "manage_clients"
  | "manage_companies"
  | "create_invoices"
  | "validate_invoices"
  | "view_ttn"
  | "submit_ttn"
  | "read_only";

export const DROITS_PAR_ROLE: Record<PageType, Record<PageRole, Droit[]>> = {
  comptable: {
    owner: [
      "manage_members",
      "invite_members",
      "manage_clients",
      "create_invoices",
      "validate_invoices",
      "view_ttn",
      "submit_ttn",
    ],
    admin: [
      "invite_members",
      "manage_clients",
      "create_invoices",
      "validate_invoices",
      "view_ttn",
    ],
    member: ["create_invoices"],
    viewer: ["read_only"],
  },

  multi_societe: {
    owner: ["manage_members", "invite_members", "manage_companies", "view_ttn"],
    admin: ["invite_members", "manage_companies", "view_ttn"],
    member: ["create_invoices"],
    viewer: ["read_only"],
  },

  entreprise: {
    owner: [
      "manage_members",
      "invite_members",
      "create_invoices",
      "validate_invoices",
      "submit_ttn",
    ],
    admin: ["create_invoices", "validate_invoices"],
    member: ["create_invoices"],
    viewer: ["read_only"],
  },
};
