import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type LayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CompanyLayout({ children, params }: LayoutProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getSession();
  const user = auth.session?.user;
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("id", id)
    .maybeSingle();

  if (!company) redirect("/switch");

  return (
    <AppShell
      title={company.company_name ?? "Société"}
      subtitle="Espace Société"
      activeCompanyId={id}
      accountType="entreprise"
    >
      {children}
    </AppShell>
  );
}
