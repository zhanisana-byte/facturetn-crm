import { redirect } from "next/navigation";

export default async function ProfileDashboardRedirect() {
  redirect("/dashboard");
}
