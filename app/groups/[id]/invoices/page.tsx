import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

export default async function GroupInvoicesPage({ params }: Props) {
  const { id } = await params;
  redirect(`/groups/${id}`);
}
