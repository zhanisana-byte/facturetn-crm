export default function PermissionBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-rose-50 text-rose-700 border-rose-200",
      ].join(" ")}
      title={ok ? "Autorisé" : "Non autorisé"}
    >
      {ok ? "" : ""} {label}
    </span>
  );
}
