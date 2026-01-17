import AppShell from "@/app/components/AppShell";
import AddCompanyToGroupClient from "./AddCompanyToGroupClient";

export const dynamic = "force-dynamic";

export default async function AddCompanyToGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id  } = await params;

  return (
    <AppShell
      title="Ajouter une société au groupe"
      subtitle="Sélectionner une société à rattacher au groupe"
    >
      <AddCompanyToGroupClient groupId={id} />
    </AppShell>
  );
}
