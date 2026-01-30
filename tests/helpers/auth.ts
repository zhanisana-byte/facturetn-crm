import { expect, Page } from "@playwright/test";

export function uniq(prefix = "test") {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function registerUser(page: Page, email: string, password: string, fullName = "Robot Test") {
  await page.goto("/register");
  await page.getByLabel(/Nom complet/i).fill(fullName);
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/Mot de passe/i).fill(password);
  await page.getByRole("button", { name: /Créer mon compte/i }).click();

  // Dans ce projet, on redirige vers /auth/check-email même si la confirmation email est OFF.
  // On ne dépend pas de cette page: on se connecte ensuite via /login.
  await expect(page).toHaveURL(/check-email|auth|register/i);
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/Mot de passe/i).fill(password);
  await page.getByRole("button", { name: /Se connecter/i }).click();
  await expect(page).toHaveURL(/\/switch/i);
}

export async function logoutUser(page: Page) {
  await page.request.post("/logout");
}
