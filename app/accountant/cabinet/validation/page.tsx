import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CabinetValidationPage() {
  return (
    <AppShell
      title="Validation cabinet"
      subtitle="Valider les sociétés / clients et gérer les accès"
      accountType="cabinet"
    >
      <div className="ftn-card p-6">
        <div className="ftn-muted">
          Page de validation Cabinet (à compléter selon tes règles).
        </div>
      </div>
    </AppShell>
  );
}
