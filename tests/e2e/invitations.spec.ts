import { test, expect } from "@playwright/test";
import {
  uniqEmail,
  register,
  login,
  logout,
  createCompany,
  createCompanyInvitation,
} from "../helpers/utils";

test.describe("Robot A->Z: invitations (Société -> Profil)", () => {
  test("Inviter puis refuser depuis /invitations", async ({ page }) => {
    const ownerEmail = uniqEmail("owner");
    const invitedEmail = uniqEmail("invitee");
    const password = "Test12345!";

    // 1) Owner: register + login
    await register(page, { fullName: "Owner Robot", email: ownerEmail, password });
    await login(page, { email: ownerEmail, password });

    // 2) Owner: create company (creation rapide)
    const companyId = await createCompany(page, { name: "Société Robot", taxId: "1304544Z" });

    // 3) Owner: send invitation to invitedEmail
    await createCompanyInvitation(page, { companyId, invitedEmail });

    // 4) Logout owner
    await logout(page);

    // 5) Invitee: register + login
    await register(page, { fullName: "Invitee Robot", email: invitedEmail, password });
    await login(page, { email: invitedEmail, password });

    // 6) Invitee: should see invitation in /invitations with buttons
    await page.goto("/invitations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Société Robot")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Accepter/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Refuser/i })).toBeVisible();

    // 7) Refuse invitation
    await page.getByRole("button", { name: /Refuser/i }).click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Société Robot")).toHaveCount(0);
  });

  test("Inviter puis accepter: l'entité apparait dans /switch", async ({ page }) => {
    const ownerEmail = uniqEmail("owner");
    const invitedEmail = uniqEmail("invitee");
    const password = "Test12345!";

    // Owner
    await register(page, { fullName: "Owner Robot", email: ownerEmail, password });
    await login(page, { email: ownerEmail, password });
    const companyId = await createCompany(page, { name: "Société Robot 2", taxId: "1304544Z" });
    await createCompanyInvitation(page, { companyId, invitedEmail });
    await logout(page);

    // Invitee
    await register(page, { fullName: "Invitee Robot", email: invitedEmail, password });
    await login(page, { email: invitedEmail, password });
    await page.goto("/invitations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Société Robot 2")).toBeVisible({ timeout: 15000 });

    // Accept
    await page.getByRole("button", { name: /Accepter/i }).click();
    await page.waitForLoadState("domcontentloaded");

    // The accept flow refreshes and usually redirects / reloads.
    // Verify it appears in /switch as an available page.
    await page.goto("/switch", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Société Robot 2")).toBeVisible({ timeout: 15000 });
  });
});
