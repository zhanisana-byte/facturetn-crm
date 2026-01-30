import { redirect } from "next/navigation";

export default async function RegistrePage() {
  // Compat ancienne route: /registre -> /register
  redirect("/register");
}
