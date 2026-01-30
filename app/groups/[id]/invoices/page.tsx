import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

/**
 * ⚠️ L'espace Groupe ne gère PAS la facturation.
 * Le pack Groupe = 29 DT / société interne active, mais les factures restent au niveau des SOCIÉTÉS.
 */
export default async function GroupInvoicesPage({ params }: Props) {
  const { id } = await params;
  redirect(`/groups/${id}`);
}
