import AcceptClient from "./AcceptClient";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptClient token={token} />;
}
