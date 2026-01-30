import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AccountType } from "@/app/types";

// DB values for user_workspace.active_mode
export type ActiveMode = "profil" | "entreprise" | "comptable" | "multi_societe";

// Backward/forward compatibility alias
export type WorkspaceMode = ActiveMode;

export type WorkspaceRow = {
  user_id: string;
  active_mode: ActiveMode | null;
  active_company_id: string | null;
  active_group_id: string | null;
  updated_at: string | null;
};

function normalizeActiveMode(v: unknown): ActiveMode {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "entreprise") return "entreprise";
  if (s === "comptable") return "comptable";
  if (s === "multi_societe") return "multi_societe";

  // legacy values (some old UI wrote these)
  if (s === "cabinet") return "comptable";
  if (s === "groupe") return "multi_societe";

  return "profil";
}

/**
 * Map workspace active_mode → UI shell (AccountType)
 *
 * ✅ Supports BOTH call styles to avoid future build breaks:
 *   - shellTypeFromWorkspace("entreprise")
 *   - shellTypeFromWorkspace(workspaceRow)
 */
export function shellTypeFromWorkspace(
  arg?: ActiveMode | WorkspaceRow | null
): AccountType {
  const mode: ActiveMode | null | undefined =
    typeof arg === "string"
      ? (arg as ActiveMode)
      : (arg as WorkspaceRow | null | undefined)?.active_mode;

  const m = normalizeActiveMode(mode);
  if (m === "entreprise") return "entreprise";
  if (m === "comptable") return "comptable";
  if (m === "multi_societe") return "multi_societe";
  return "profil";
}

/**
 * Ensure a user_workspace row exists for the current authenticated user.
 * - returns existing row if present
 * - creates one if missing (ignores RLS errors)
 * - returns a safe fallback row if insert is blocked
 */
export async function ensureWorkspaceRow(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<WorkspaceRow | null> {
  // PERF: avoid extra auth calls when the caller already knows the user id.
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const { data: auth } = await supabase.auth.getUser();
    resolvedUserId = auth?.user?.id ?? undefined;
  }
  if (!resolvedUserId) return null;

  // 1) Read
  const { data: ws } = await supabase
    .from("user_workspace")
    .select("user_id,active_mode,active_company_id,active_group_id,updated_at")
    .eq("user_id", resolvedUserId)
    .maybeSingle();

  if (ws) {
    return {
      user_id: ws.user_id,
      active_mode: normalizeActiveMode(ws.active_mode),
      active_company_id: ws.active_company_id ?? null,
      active_group_id: ws.active_group_id ?? null,
      updated_at: ws.updated_at ?? null,
    };
  }

  // 2) Create if missing
  try {
    const payload = {
      user_id: resolvedUserId,
      active_mode: "profil" as ActiveMode,
      active_company_id: null,
      active_group_id: null,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted } = await supabase
      .from("user_workspace")
      .insert(payload)
      .select("user_id,active_mode,active_company_id,active_group_id,updated_at")
      .single();

    if (inserted) {
      return {
        user_id: inserted.user_id,
        active_mode: normalizeActiveMode(inserted.active_mode),
        active_company_id: inserted.active_company_id ?? null,
        active_group_id: inserted.active_group_id ?? null,
        updated_at: inserted.updated_at ?? null,
      };
    }
  } catch {
    // ignore (RLS)
  }

  // 3) Fallback
  return {
    user_id: resolvedUserId,
    active_mode: "profil",
    active_company_id: null,
    active_group_id: null,
    updated_at: null,
  };
}
