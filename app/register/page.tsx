// app/register/page.tsx
import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Chargement...</div>}>
      <RegisterClient />
    </Suspense>
  );
}
