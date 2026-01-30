import Link from "next/link";
import type { ReactNode } from "react";

export function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export function LuxCard({
  title,
  subtitle,
  icon,
  right,
  children,
  className,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={cn("ftn-card-lux ftn-reveal", className)} style={{ animationDelay: `${delay}ms` }}>
      <div className="ftn-card-head">
        <div className="ftn-card-titleRow">
          {icon ? <div className="ftn-ic">{icon}</div> : null}
          <div>
            <div className="ftn-card-title">{title}</div>
            {subtitle ? <div className="ftn-card-sub">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="ftn-card-right">{right}</div> : null}
      </div>
      <div className="ftn-card-body">{children}</div>
      <div className="ftn-card-glow" aria-hidden="true" />
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
  pulse = false,
}: {
  tone?: "neutral" | "warning" | "success" | "info";
  children: ReactNode;
  pulse?: boolean;
}) {
  return <span className={cn("ftn-pill", `ftn-pill-${tone}`, pulse && "ftn-pill-pulse")}>{children}</span>;
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "ghost" | "soft" | "success";
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("ftn-btn-lux", `ftn-btn-${variant}`)}>
      <span className="ftn-btn-shine" aria-hidden="true" />
      <span className="ftn-btn-text">{children}</span>
    </Link>
  );
}

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ftn-statrow" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,.18)" }}>
      <div className="ftn-statlabel" style={{ color: "rgba(102,112,133,.95)", fontSize: 13 }}>{label}</div>
      <div className="ftn-statvalue" style={{ fontWeight: 800, color: "rgba(11,18,32,.92)" }}>{value}</div>
    </div>
  );
}
