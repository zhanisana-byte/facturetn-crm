"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(186,134,52,.14),transparent_55%),radial-gradient(900px_circle_at_80%_20%,rgba(56,189,248,.10),transparent_55%),linear-gradient(to_bottom,#f7f8fb,#eef2f7)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-stretch px-4 py-10">
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="relative hidden overflow-hidden rounded-3xl border border-[rgba(148,163,184,.22)] bg-white/55 p-8 shadow-[0_20px_60px_rgba(15,23,42,.10)] backdrop-blur lg:flex lg:flex-col">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm">
                FT
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  FactureTN
                </div>
                <div className="text-xs text-slate-600">
                  Facturation électronique · Tunisie
                </div>
              </div>
            </div>

            <div className="mt-10">
              <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                Plus simple. Plus clair.
              </div>
              <div className="mt-3 text-sm leading-relaxed text-slate-600">
                Un espace premium pour gérer vos sociétés, vos factures et la
                collaboration comptable — sans complexité.
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              <div className="rounded-2xl border border-[rgba(148,163,184,.22)] bg-white/60 p-4">
                <div className="text-sm font-bold text-slate-900">
                  Collaboration comptable
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Rôles & permissions, invitations, et contrôle d’accès par
                  société.
                </div>
              </div>

              <div className="rounded-2xl border border-[rgba(148,163,184,.22)] bg-white/60 p-4">
                <div className="text-sm font-bold text-slate-900">
                  Multi-sociétés
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Sociétés, accès et navigation adaptée à votre type
                  de compte.
                </div>
              </div>

              <div className="rounded-2xl border border-[rgba(148,163,184,.22)] bg-white/60 p-4">
                <div className="text-sm font-bold text-slate-900">
                  Prêt pour TTN
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Déclaration mensuelle et suivi des éléments nécessaires.
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(186,134,52,.22),transparent_60%)] blur-2xl"
            />
          </div>

          <div className="flex w-full items-center justify-center">
            <div className="w-full max-w-md">
              <div className="mb-6 flex items-center justify-between lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white">
                    FT
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      FactureTN
                    </div>
                    <div className="text-xs text-slate-600">
                      Facturation électronique
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[rgba(148,163,184,.22)] bg-white/70 p-7 shadow-[0_20px_60px_rgba(15,23,42,.12)] backdrop-blur">
                <div className="mb-6">
                  <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                    {title}
                  </div>
                  {subtitle ? (
                    <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
                  ) : null}
                </div>

                {children}

                <div className="mt-6 flex items-center justify-between text-xs text-slate-600">
                  <Link
                    className="underline decoration-slate-300 hover:decoration-slate-500"
                    href="/"
                  >
                    Accueil
                  </Link>
                  <div className="opacity-80">
                     {new Date().getFullYear()} FactureTN
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
