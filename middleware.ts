import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) assets publics
  if (isPublicAsset(pathname)) return NextResponse.next();

  // 2) routes auth + routes publiques
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password");

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/mentions-legales") ||
    pathname.startsWith("/conditions-generales") ||
    pathname.startsWith("/help") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/health");

  const res = NextResponse.next();

  // ✅ Supabase server client (edge) + cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  // 3) session
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  // connecté et va sur /login etc -> /switch
  if (session && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/switch";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // routes publiques: OK
  if (isPublicRoute || isAuthRoute) return res;

  // toutes les autres routes: session obligatoire
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // /switch est toujours autorisé
  if (pathname === "/switch" || pathname.startsWith("/switch/")) return res;

  // Déduire l'espace demandé via URL
  const area = pathname.startsWith("/companies")
    ? "companies"
    : pathname.startsWith("/groups")
    ? "groups"
    : pathname.startsWith("/accountant")
    ? "accountant"
    : pathname.startsWith("/pdg")
    ? "pdg"
    : "profil";

  // 4) Lire account_type (avec cache cookie simple)
  const cachedUid = req.cookies.get("ftn_uid")?.value;
  const cachedType = req.cookies.get("ftn_account_type")?.value;

  let accountTypeRaw = "";

  // cache
  if (cachedUid === session.user.id && cachedType) {
    accountTypeRaw = String(cachedType).toLowerCase().trim();
  } else {
    // ⚠️ IMPORTANT : si RLS bloque app_users, on fallback en "profil"
    try {
      const { data: profile, error } = await supabase
        .from("app_users")
        .select("account_type")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        // fallback robuste
        accountTypeRaw = "profil";
      } else {
        accountTypeRaw = String(profile?.account_type ?? "").toLowerCase().trim();
        if (!accountTypeRaw) accountTypeRaw = "profil";
      }
    } catch {
      accountTypeRaw = "profil";
    }

    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set({
      name: "ftn_uid",
      value: session.user.id,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 60 * 30,
    });
    res.cookies.set({
      name: "ftn_account_type",
      value: accountTypeRaw,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 60 * 30,
    });
  }

  // normalisation legacy
  const accountType =
    accountTypeRaw === "cabinet"
      ? "comptable"
      : accountTypeRaw === "groupe"
      ? "multi_societe"
      : accountTypeRaw === "client"
      ? "entreprise"
      : accountTypeRaw;

  // PROFIL : accès total (très important pour éviter blocage)
  if (accountType === "profil") return res;

  // PDG only
  if (area === "pdg") {
    if (accountTypeRaw !== "pdg")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  // ENTREPRISE : uniquement /companies
  if (accountType === "entreprise") {
    if (area !== "companies")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  // GROUPE : uniquement /groups
  if (accountType === "multi_societe") {
    if (area !== "groups")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  // COMPTABLE : uniquement /accountant
  if (accountType === "comptable") {
    if (area !== "accountant")
      return NextResponse.redirect(new URL("/switch", req.url));
    return res;
  }

  // fallback
  return NextResponse.redirect(new URL("/switch", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|robots.txt|sitemap.xml).*)"],
};
