// app/types.ts

export type DbAccountType = "client" | "cabinet" | "groupe";
export type AccountType = "entreprise" | "multi_societe" | "comptable";

export function mapDbAccountType(v?: string | null): AccountType | undefined {
  if (v === "client") return "entreprise";
  if (v === "cabinet") return "comptable";
  if (v === "groupe") return "multi_societe";
  return undefined;
}
