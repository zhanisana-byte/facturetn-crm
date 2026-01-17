import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next();

  const path = req.nextUrl.pathname;

  // Routes publiques
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/mentions-legales") ||
    path.startsWith("/conditions-generales") ||
    path.startsWith("/help") ||
    path.startsWith("/blocked");

  const isAuthPage =
    path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/forgot-password");

  // Guards (blocked)
  const block = (reason: string) => {
    const url = new URL("/blocked", req.url);
    url.searchParams.set("reason", reason);
    url.searchParams.set("next", "/switch");
    return NextResponse.redirect(url);
  };

  // Facturation interdite hors Profil
  if (
    path.startsWith("/accountant/invoices") ||
    path.startsWith("/accountant/recurring") ||
    path.startsWith("/accountant/declaration")
  ) {
    return block("cabinet_facturation");
  }
  if (/^\/companies\/[^\/]+\/(invoices|recurring)(\/|$)/.test(path)) {
    return block("societe_facturation");
  }
  if (/^\/groups\/[^\/]+\/(invoices|recurring)(\/|$)/.test(path)) {
    return block("groupe_facturation");
  }

  // Legacy / deprecated routes
  if (
    path === "/declaration" ||
    path.startsWith("/declarations") ||
    path.startsWith("/company/select") ||
    path.startsWith("/cabinet/")
  ) {
    return block("deprecated");
  }

  // ✅ IMPORTANT : session via cookies (rapide, pas de réseau)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData.session;

  // Pas connecté => tout sauf public vers login
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Connecté => bloquer pages auth
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
