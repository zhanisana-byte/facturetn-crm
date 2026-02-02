
export function getPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      return "https://facturetn.com";
    }
    return "http://localhost:3000";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }

  return `https://${raw}`.replace(/\/$/, "");
}
