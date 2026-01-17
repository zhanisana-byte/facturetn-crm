import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Chargement…</div>}>
      <LoginClient />
    </Suspense>
  );
}
