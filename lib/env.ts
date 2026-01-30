export type EnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "RESEND_API_KEY"
  | "RESEND_FROM";

export function getEnv(key: EnvKey): string {
  const v = process.env[key];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return String(v).trim();
}

export function optionalEnv(key: EnvKey): string | null {
  const v = process.env[key];
  return v && String(v).trim() ? String(v).trim() : null;
}
