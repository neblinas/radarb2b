import { supabase } from "./supabase";
import { emailDomain, normalizeEmailForSuppression, SuppressionReason } from "./suppressionRules";

/**
 * Compliance / suppression.
 *
 * Antes de QUALQUER envio comercial (automático ou humano), verificar
 * `is_suppressed`. A fonte de verdade é a tabela `public.email_suppressions`.
 * A lógica pura está em `suppressionRules.ts`.
 */

export { emailDomain, normalizeEmailForSuppression };
export type { SuppressionReason };
/**
 * Verifica no servidor se um contacto está suprimido. Falha em segurança:
 * se a verificação falhar, devolve `true` (não enviar).
 */
export async function checkSuppressed(params: {
  email?: string;
  domain?: string;
  companyId?: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_suppressed", {
      p_organization_id: null, // resolvido no servidor pela sessão seria ideal; ver nota em AUTOPILOT.md
      p_email: params.email ?? null,
      p_domain: params.domain ?? (params.email ? emailDomain(params.email) : null),
      p_company_id: params.companyId ?? null,
    });
    if (error) return true; // fail-safe
    return data === true;
  } catch {
    return true; // fail-safe: sem certeza, não enviar
  }
}

