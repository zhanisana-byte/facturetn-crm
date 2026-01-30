import AuthShell from "@/app/components/AuthShell";
import RegisterClient from "./RegisterClient";

export default async function RegisterPage() {
  return (
    <AuthShell title="Créer un compte" subtitle="Créez votre accès professionnel en quelques secondes.">
      <RegisterClient />
    </AuthShell>
  );
}
