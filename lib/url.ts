/**
 * Retourne l’URL publique canonique de l’application.
 * - En production : JAMAIS localhost
 * - En développement : localhost autorisé
 */
export function getPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    "";

  // ✅ Sécurité absolue : jamais localhost en production
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      return "https://facturetn.com";
    }
    return "http://localhost:3000";
  }

  // raw peut être :
  // - https://facturetn.com
  // - facturetn.com
  // - xxx.vercel.app
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }

  return `https://${raw}`.replace(/\/$/, "");
}
