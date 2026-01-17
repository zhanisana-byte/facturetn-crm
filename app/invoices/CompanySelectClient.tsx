"use client";

import { useTransition } from "react";
import { Card, Table, Btn, Badge } from "@/components/ui";

type CompanyRow = {
  id: string;
  name: string;
  role: string;
  canCreateInvoices: boolean;
};

export default function CompanySelectClient({
  companies,
  activateCompany,
  message,
}: {
  companies: CompanyRow[];
  activateCompany: (companyId: string) => Promise<void>;
  message?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Card
        title="Choisir une société"
        subtitle={
          message ??
          "Sélectionnez la société pour afficher et créer les factures (OWNER ou accès facturation)."
        }
      >
        {companies.length === 0 ? (
          <div className="text-sm opacity-80">
            Aucune société disponible. Créez d’abord une société depuis votre Profil.
          </div>
        ) : (
          <Table
            head={
              <tr>
                <th>Société</th>
                <th>Rôle</th>
                <th>Droit facturation</th>
                <th></th>
              </tr>
            }
          >
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.role}</td>
                <td>
                  {c.canCreateInvoices || c.role === "owner" ? (
                    <Badge>OK</Badge>
                  ) : (
                    <span className="text-xs opacity-70">Non</span>
                  )}
                </td>
                <td className="text-right">
                  <Btn
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await activateCompany(c.id);
                      })
                    }
                  >
                    {pending ? "Activation…" : "Ouvrir"}
                  </Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
