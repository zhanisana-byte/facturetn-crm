"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Erreur lors du chargement</h2>
      <p className="mt-2 text-sm text-slate-600">{error.message}</p>
    </div>
  );
}
