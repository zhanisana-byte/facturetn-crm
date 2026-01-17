import AppShell from "@/app/components/AppShell";
import ValidationClient from "./ValidationClient";
import { requireAppUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function CabinetValidationPage() {
  // Accès réservé au comptable/cabinet (validation)
  await requireAppUser(["comptable", "cabinet"]);

  return (
    <AppShell
      title="Validation cabinet"
      subtitle="Valider les sociétés / clients et gérer les accès"
    >
      <ValidationClient />
    </AppShell>
  );
}
