export type SidebarItem =
  | { kind: "title"; key: string; label: string }
  | { kind: "divider"; key: string }
  | {
      kind: "link";
      key: string;
      label: string;
      href: string;
      exact?: boolean;
      badge?: string;
      /**
       * Nom d'icône (string) pour éviter une dépendance à une lib d'icônes.
       * Exemples: "dashboard", "settings", "entities", "invitations", "invoices",
       * "recurring", "declarations", "help", "switch", "team", "subscription",
       * "ttn", "clients", "company", "create".
       */
      icon?: string;
    };
