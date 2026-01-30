import { test, expect } from "@playwright/test";
import { loginUser, logoutUser, registerUser, uniq } from "../helpers/auth";

test("Robot A->Z: société + invitations (accepter/refuser) + switch", async ({ page }) => {
  const ownerEmail = `${uniq("owner")}@example.com`;
  const inviteeEmail = `${uniq("inv")}@example.com`;
  const password = "Test12345!";

  // 1) Owner: register + login
  await registerUser(page, ownerEmail, password, "Owner Robot");
  await loginUser(page, ownerEmail, password);

  // 2) Créer une société (Nom + MF)
  await page.goto("/companies/create");
  await page.getByLabel(/Nom de la société/i).fill("Société Robot");
  await page.getByLabel(/Matricule fiscal/i).fill("1304544Z");
  await page.getByRole("button", { name: /^Créer$/i }).click();

  // success?id=...
  await expect(page).toHaveURL(/\/companies\/success\?id=/i);
  const url = new URL(page.url());
  const companyId = url.searchParams.get("id");
  expect(companyId).toBeTruthy();

  // 3) Invitations société: créer une invitation vers l'invité
  await page.goto(`/companies/${companyId}/invitations`);
  await expect(page.getByText(/Envoyer une invitation/i)).toBeVisible();
  await page.getByLabel(/^Email$/i).fill(inviteeEmail);
  await page.getByLabel(/Objectif/i).selectOption("client_management");
  // permissions: par défaut can_manage_customers=true (ok)
  await page.getByRole("button", { name: /Créer invitation/i }).click();
  await expect(page.getByText(/Invitation créée/i)).toBeVisible({ timeout: 15_000 });

  // 4) Logout owner
  await logoutUser(page);

  // 5) Invitee: register + login
  await registerUser(page, inviteeEmail, password, "Invitee Robot");
  await loginUser(page, inviteeEmail, password);

  // 6) Vérifier que l'invitation apparaît dans /invitations avec les boutons Accepter/Refuser
  await page.goto("/invitations");
  await expect(page.getByText(/Mes invitations reçues/i)).toBeVisible();
  await expect(page.getByText(/Société Robot/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Accepter/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Refuser/i }).first()).toBeVisible();

  // 7) Refuser (scénario refus)
  await page.getByRole("button", { name: /Refuser/i }).first().click();
  // La table se refresh via reload; on attend disparition
  await expect(page.getByText(/Société Robot/i)).toHaveCount(0, { timeout: 15_000 });

  // 8) Re-login owner, recréer une invitation, puis acceptation
  await logoutUser(page);
  await loginUser(page, ownerEmail, password);
  await page.goto(`/companies/${companyId}/invitations`);
  await page.getByLabel(/^Email$/i).fill(inviteeEmail);
  await page.getByRole("button", { name: /Créer invitation/i }).click();
  await expect(page.getByText(/Invitation créée/i)).toBeVisible({ timeout: 15_000 });

  await logoutUser(page);
  await loginUser(page, inviteeEmail, password);
  await page.goto("/invitations");
  await expect(page.getByText(/Société Robot/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Accepter/i }).first().click();

  // Après acceptation, votre UI reload et supprime la ligne (pending)
  await expect(page.getByText(/Société Robot/i)).toHaveCount(0, { timeout: 15_000 });

  // 9) Vérifier que le switch affiche maintenant une page (au moins 1)
  await page.goto("/switch");
  await expect(page.locator("body")).toContainText(/Société Robot|workspaces|pages|Société/i);
});
