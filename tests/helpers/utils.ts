import { expect, Page } from "@playwright/test";

export function uniqEmail(prefix = "robot") {
  const stamp = Date.now();
  const rnd = Math.floor(Math.random() * 1000);
  return `${prefix}.${stamp}.${rnd}@example.com`;
}

export async function register(page: Page, opts: { fullName: string; email: string; password: string }) {
  await page.goto("/register", { waitUntil: "domcontentloaded" });

  await page.locator(".ftn-label", { hasText: "Nom complet" }).locator("xpath=following::input[1]").fill(opts.fullName);
  await page.locator(".ftn-label", { hasText: "Email" }).locator("xpath=following::input[1]").fill(opts.email);
  await page.locator(".ftn-label", { hasText: "Mot de passe" }).locator("xpath=following::input[1]").fill(opts.password);

  await page.getByRole("button", { name: /Créer mon compte/i }).click();

  // Le register redirige souvent vers /auth/check-email. Dans tous les cas, on ne dépend pas de cette page.
  await page.waitForLoadState("domcontentloaded");
}

export async function login(page: Page, opts: { email: string; password: string }) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await page.locator(".ftn-label", { hasText: "Email" }).locator("xpath=following::input[1]").fill(opts.email);
  await page.locator(".ftn-label", { hasText: "Mot de passe" }).locator("xpath=following::input[1]").fill(opts.password);

  await page.getByRole("button", { name: /Se connecter/i }).click();
  await page.waitForLoadState("domcontentloaded");

  // Après login, le code pousse vers /switch
  await expect(page).toHaveURL(/\/switch/i);
}

export async function logout(page: Page) {
  await page.request.post("/logout");
}

export async function createCompany(page: Page, opts: { name: string; taxId?: string }) {
  await page.goto("/companies/create", { waitUntil: "domcontentloaded" });

  await page.getByLabel("Nom de la société *").fill(opts.name);
  if (opts.taxId) {
    await page.getByLabel("Matricule fiscal (MF)").fill(opts.taxId);
  }

  await page.getByRole("button", { name: /^Créer$/i }).click();

  await expect(page).toHaveURL(/\/companies\/success\?id=/i);
  const url = new URL(page.url());
  const id = url.searchParams.get("id");
  expect(id).toBeTruthy();
  return id as string;
}

export async function createCompanyInvitation(page: Page, opts: { companyId: string; invitedEmail: string }) {
  await page.goto(`/companies/${opts.companyId}/invitations`, { waitUntil: "domcontentloaded" });

  // Remplir email
  await page.getByPlaceholder("client@exemple.com").fill(opts.invitedEmail);

  // Cliquez "Créer invitation"
  await page.getByRole("button", { name: /Créer invitation/i }).click();

  // OK message + lien
  const ok = page.locator(".ftn-alert.tone-good");
  await expect(ok).toBeVisible();
  const text = await ok.textContent();

  // Le serveur renvoie généralement un inviteLink dans le message.
  // Exemple: "Invitation créée. Lien: https://.../access/accept/TOKEN"
  const match = text?.match(/https?:\/\/\S+/i) || text?.match(/\/access\/accept\/\S+/i);
  const link = match ? match[0] : null;
  return { okText: text ?? "", inviteLink: link };
}
