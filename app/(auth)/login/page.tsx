import { Suspense } from "react";
import LoginClient from "./LoginClient";


export default async function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 ftn-muted">Chargement...</div>}>
      <LoginClient />
    </Suspense>
  );
}
