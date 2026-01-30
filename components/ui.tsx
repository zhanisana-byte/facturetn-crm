import Link from "next/link";
import { ReactNode } from "react";
import type { AccountType } from "@/app/types";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"ftn-card-lux ftn-reveal " + className}>
      {title ? (
        <div className="ftn-card-head">
          <div className="ftn-card-titleRow">
            <div>
              <div className="ftn-card-title">{title}</div>
              {subtitle ? <div className="ftn-card-sub">{subtitle}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="ftn-card-body">{children}</div>
      <div className="ftn-card-glow" aria-hidden="true" />
    </section>
  );
}

export function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return <button {...rest} className={"ftn-btn " + className} />;
}

export function BtnGhost(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return <button {...rest} className={"ftn-btn-ghost " + className} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={"ftn-input " + className} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select {...rest} className={"ftn-select " + className} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="ftn-badge">{children}</span>;
}

export function Nav({ accountType }: { accountType?: AccountType }) {
  return (
    <div className="ftn-topbar">
      <div>
        <div className="ftn-title">FactureTN CRM</div>
        <div className="ftn-subtitle">Mode: {accountType ?? "…"}</div>
      </div>

      <div className="ftn-actions">
        <Link className="ftn-btn-ghost" href="/dashboard">Dashboard</Link>

        {accountType === "comptable" ? (
          <Link className="ftn-btn-ghost" href="/accountant/clients">Mes clients</Link>
        ) : (
          <>
            <Link className="ftn-btn-ghost" href="/companies">Sociétés</Link>
            <Link className="ftn-btn-ghost" href="/invoices">Factures</Link>
          </>
        )}

        <Link className="ftn-btn-ghost" href="/profile">Profil</Link>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-auto rounded-3xl border" style={{ borderColor: "rgba(148,163,184,.18)", background: "rgba(255,255,255,.55)" }}>
      <table className="ftn-table">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
