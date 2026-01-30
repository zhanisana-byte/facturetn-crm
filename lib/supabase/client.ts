import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ✅ Ne crash pas le site : retourne null si env manquante
  if (!url || !anon) {
    if (typeof window !== "undefined") {
      console.error("Supabase NEXT_PUBLIC env missing in browser", {
        url,
        anon: Boolean(anon),
      });
    }
    return null as any;
  }

  return createBrowserClient(url, anon);
}
