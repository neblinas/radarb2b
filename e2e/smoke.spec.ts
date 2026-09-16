import { expect, test } from "@playwright/test";

test("a aplicação responde e carrega o login", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(500);

  await expect(page).toHaveTitle(/Radar B2B/i);
});

test("as rotas principais não devolvem erro HTTP 5xx", async ({ page }) => {
  test.setTimeout(120_000);

  const routes = [
    "/",
    "/pesquisa",
    "/pesquisas-guardadas",
    "/oportunidades",
    "/alertas",
    "/conta",
  ];

  for (const route of routes) {
    const response = await page.goto(route, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    expect(
      response?.status(),
      `Falha na rota ${route}`,
    ).toBeLessThan(500);
  }
});
