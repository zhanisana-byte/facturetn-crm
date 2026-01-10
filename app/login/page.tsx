import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="ftn-shell">
          <div className="ftn-auth">
            <div className="ftn-auth-wrap">
              <div className="ftn-auth-hero">
                <h3>FactureTN</h3>
                <p className="ftn-muted mt-3">Chargement…</p>
              </div>
              <div className="ftn-auth-card">Chargement…</div>
            </div>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
