"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountType } from "@/app/types";
import type { ActivePage, PageType } from "./sidebarConfig";

type ShellState = {
  accountType: AccountType;
  activePage: ActivePage;
  activeCompanyId: string | null;
  activeGroupId: string | null; 
};

const KEY = "ftn_shell_state_v1";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useShellState(input: {
  accountType: AccountType;
  activeCompanyId?: string | null;
  activeGroupId?: string | null; 
}) {
  const [state, setState] = useState<ShellState>(() => ({
    accountType: input.accountType,
    activePage: null,
    activeCompanyId: input.activeCompanyId ?? null,
    activeGroupId: input.activeGroupId ?? null, 
  }));

  useEffect(() => {
    const stored = safeParse<Partial<ShellState>>(sessionStorage.getItem(KEY));

    if (!stored) {
      sessionStorage.setItem(KEY, JSON.stringify(state));
      return;
    }

    const merged: ShellState = {
      accountType: input.accountType,

      activePage: (stored.activePage ?? null) as ActivePage,

      activeCompanyId: (input.activeCompanyId ?? stored.activeCompanyId ?? null) as string | null,
      activeGroupId: (input.activeGroupId ?? stored.activeGroupId ?? null) as string | null,
    };

    setState(merged);
    sessionStorage.setItem(KEY, JSON.stringify(merged));
    
  }, [input.accountType, input.activeCompanyId, input.activeGroupId]);

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const api = useMemo(() => {
    return {
      state,

      setAccountType(accountType: AccountType) {
        setState((s) => ({ ...s, accountType }));
      },

      setActiveCompany(activeCompanyId: string | null) {
        setState((s) => ({ ...s, activeCompanyId }));
      },

      setActiveGroup(activeGroupId: string | null) {
        setState((s) => ({ ...s, activeGroupId }));
      },

      clearActivePage() {
        setState((s) => ({ ...s, activePage: null }));
      },

      setActivePage(page: { id: string; type: PageType; role?: "owner" | "admin" | "member" | "viewer" }) {
        setState((s) => ({
          ...s,
          activePage: { id: page.id, type: page.type, role: page.role },
        }));
      },
    };
  }, [state]);

  return api;
}
