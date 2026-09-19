import { expect, test } from "@playwright/test";

test("o centro de ajuda responde sobre planos e preços", async ({ page }) => {
  await page.goto("/contacto");

  await page.getByRole("textbox", { name: "Coloca a tua questão" }).fill("qualo preço?");
  await page.getByRole("button", { name: "Obter resposta" }).click();

  await expect(page.getByRole("paragraph").filter({ hasText: "Planos e preços" })).toBeVisible();
  await expect(page.getByText(/Free, sem custo.*Starter, 19.*Pro, 39/)).toBeVisible();
});

test("o centro de ajuda apresenta o ticket e FAQ", async ({ page }) => {
  await page.goto("/contacto");

  await expect(page.getByRole("heading", { name: "Abrir ticket" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email de resposta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perguntas frequentes", exact: true })).toBeVisible();
});

test("o back-office bloqueia visitantes sem role", async ({ page }) => {
  await page.goto("/backoffice");

  await expect(page.getByRole("heading", { name: "Área reservada" })).toBeVisible();
  await expect(page.getByText(/role administrativa ou comercial/)).toBeVisible();
});

test("as rotas CRM existem e mantêm acesso protegido", async ({ page }) => {
  for (const route of ["/backoffice/leads", "/backoffice/contas", "/backoffice/tickets"]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `Falha na rota ${route}`).toBeLessThan(500);
    await expect(page.getByText(/Área reservada|A validar permissões/)).toBeVisible();
  }
});
