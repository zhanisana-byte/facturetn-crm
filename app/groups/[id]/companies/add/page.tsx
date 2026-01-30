import AddCompanyToGroupClient from "./AddCompanyToGroupClient";

export const dynamic = "force-dynamic";

export default async function AddCompanyToGroupPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id  } = await params;

  return (
<AddCompanyToGroupClient groupId={id} />
  );
}
