import { redirect } from "next/navigation";

export default function RegistrePage() {
  // Compat ancienne route: /registre -> /register
  redirect("/register");
}
