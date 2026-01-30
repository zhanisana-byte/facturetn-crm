"use client";

export default function Topbar({
  title,
  subtitle,
  onOpenMobile,
}: {
  title?: string;
  subtitle?: string;
  onOpenMobile: () => void;
}) {
  return (
    <div className="ftn-header-row">
      <button type="button" className="ftn-menu-btn" onClick={onOpenMobile} aria-label="Ouvrir le menu">
        <span />
        <span />
        <span />
      </button>

      <div className="flex-1">
        {title ? <h1 className="text-xl font-semibold">{title}</h1> : null}
        {subtitle ? <p className="text-sm text-slate-600 mt-1">{subtitle}</p> : null}
      </div>
    </div>
  );
}
