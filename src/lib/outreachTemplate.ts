/**
 * Outbound — personalização determinística (puro, testável).
 *
 * Substitui variáveis de template por dados REAIS. Nunca inventa valores:
 * campos ausentes produzem "—".
 */

export const TEMPLATE_VARIABLES = [
  "{company}",
  "{nif}",
  "{awards}",
  "{value}",
  "{cpv}",
  "{participation_12m}",
] as const;

export type ProspectFacts = {
  nif?: string | number | null;
  award_count?: number | null;
  total_award_value?: number | null;
  cpv_codes?: string[] | null;
  participation_12m?: number | null;
};

function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

/** Substitui variáveis pelo valor real. Campos ausentes → "—". */
export function personalize(
  template: string,
  facts: ProspectFacts,
  companyName: string,
): string {
  const awards =
    facts.award_count !== null && facts.award_count !== undefined ? String(facts.award_count) : "—";
  const value = formatEuro(facts.total_award_value);
  const cpv = Array.isArray(facts.cpv_codes) && facts.cpv_codes.length
    ? facts.cpv_codes.slice(0, 3).join(", ")
    : "—";

  return template
    .replaceAll("{company}", companyName)
    .replaceAll("{nif}", facts.nif != null ? String(facts.nif) : "—")
    .replaceAll("{awards}", awards)
    .replaceAll("{value}", value)
    .replaceAll("{cpv}", cpv)
    .replaceAll("{participation_12m}", String(facts.participation_12m ?? "0"));
}

/** Verifica se um domínio de email é válido e seguro para envio. */
export function isBusinessEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain.includes(".")) return false;
  // Evita domínios de exemplo/placeholder.
  const blocked = ["example.com", "example.org", "test.com", "localhost"];
  return !blocked.some((bad) => domain === bad || domain.endsWith("." + bad));
}
