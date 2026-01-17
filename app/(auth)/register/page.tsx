import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Chargement…</div>}>
      <RegisterClient />
    </Suspense>
  );
}
