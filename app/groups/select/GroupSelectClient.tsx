"use client";

import { useTransition } from "react";
import { Card, Table, Btn, Badge } from "@/components/ui";

type GroupRow = { id: string; group_name: string | null; role: string | null };

export default function GroupSelectClient({
  groups,
  activate,
}: {
  groups: GroupRow[];
  activate: (groupId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Card
      title="Choisir un groupe"
      subtitle="Sélectionnez le groupe pour accéder au dashboard, clients, rôles, invitations et abonnement."
    >
      {groups.length === 0 ? (
        <div className="text-sm opacity-80">
          Aucun groupe disponible. Créez un groupe depuis votre Profil.
        </div>
      ) : (
        <Table
          head={
            <tr>
              <th>Groupe</th>
              <th>Rôle</th>
              <th></th>
            </tr>
          }
        >
          {groups.map((g) => (
            <tr key={g.id}>
              <td className="font-medium">{g.group_name ?? "Groupe"}</td>
              <td>
                <Badge>{String(g.role ?? "member").toUpperCase()}</Badge>
              </td>
              <td className="text-right">
                <Btn
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await activate(g.id);
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
  );
}
