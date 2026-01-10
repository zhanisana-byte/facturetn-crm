import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyInvoicesRedirect({ params }: PageProps) {
  const { id } = await params;

  // Redirection vers page factures globale avec filtre
  redirect(`/invoices?company=${id}`);
}
