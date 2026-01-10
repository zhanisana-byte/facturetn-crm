import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FactureTN CRM",
  description: "CRM de facturation électronique (TTN) — MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="ftn-shell">
        {children}
      </body>
    </html>
  );
}
