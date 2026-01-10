import { Suspense } from "react";
import AcceptInvitationClient from "./AcceptInvitationClient";

type PageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InvitationAcceptPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const token = sp.token || "";
  return (
    <Suspense fallback={<div className="ftn-page"><div className="ftn-card">Chargement…</div></div>}>
      <AcceptInvitationClient token={token} />
    </Suspense>
  );
}
