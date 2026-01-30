import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function GroupPermissionsPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id } = await params;
  redirect(`/groups/${id}/droits`);
}
