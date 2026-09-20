/**
 * Compliance / suppression — lógica pura (sem I/O).
 *
 * A fonte de verdade é `public.email_suppressions`; aqui estão apenas os
 * helpers determinísticos, testáveis isoladamente.
 */

export type SuppressionReason =
  | "unsubscribe"
  | "do_not_contact"
  | "bounce"
  | "complaint"
  | "manual"
  | "compliance";

/** Extrai o domínio de um email ("user@Empresa.pt" -> "empresa.pt"). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

/** Normaliza um email para comparação (trim + minúsculas). */
export function normalizeEmailForSuppression(email: string): string {
  return email.trim().toLowerCase();
}
