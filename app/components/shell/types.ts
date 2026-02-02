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
      
      icon?: string;
    };
