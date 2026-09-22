-- Adjudata — Prospeção B2B: correção da ação administrativa em lote (FASE 6).
--
-- Porquê esta migração:
--   A migração `20261007090000_prospecting_management_bulk.sql` introduziu a RPC
--   `prospect_management_action_bulk`, mas a implementação falhava sempre com:
--       ERROR: column "id" does not exist (SQLSTATE 42703)
--   mesmo com o role correto (admin/commercial_manager) e a função presente.
--
--   Causa raiz:
--     Dentro de uma função `RETURNS TABLE`, o corpo fazia
--         select * into v_result from public.prospect_management_action(...);
--     onde `v_result` é do tipo composto `public.prospect_companies`. As colunas
--     de saída da própria função em lote (`commercial_status`, `enrichment_status`,
--     `opt_out`) são variáveis PL/pgSQL e colidem com a resolução das colunas da
--     tabela ao mapear o `*` para o tipo composto, originando o erro de resolução
--     da coluna `id`.
--
--   Correção:
--     Usar atribuição direta do valor de retorno (uma row de `prospect_companies`)
--     em vez de `select * into`:
--         v_result := public.prospect_management_action(v_id, p_action, p_reason);
--
-- Âmbito:
--   * Recria APENAS `prospect_management_action_bulk` com a mesma assinatura,
--     o mesmo contrato de retorno e a mesma segurança. Nenhuma outra função,
--     tabela ou política é tocada.
--
-- Segurança (inalterada):
--   * Só admin / commercial_manager (validado no backend).
--   * security definer com search_path fixo.
--   * revoke all from public + grant execute to authenticated.

create or replace function public.prospect_management_action_bulk(
  p_ids uuid[],
  p_action text,
  p_reason text default null
)
returns table (
  prospect_id uuid,
  applied boolean,
  commercial_status text,
  enrichment_status text,
  opt_out boolean,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_id uuid;
  v_result public.prospect_companies;
  v_applied_count integer := 0;
  v_failed_count integer := 0;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  if p_action not in ('APPROVE', 'REJECT', 'READY_AUTOPILOT', 'OPT_OUT', 'RESET') then
    raise exception 'Ação inválida';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Nenhum prospecto selecionado';
  end if;

  -- Normaliza a lista: remove nulos e duplicados.
  for v_id in
    select distinct unnest(p_ids) as id
    where id is not null
  loop
    begin
      -- Cada item passa pela MESMA máquina de transição e auditoria do caso
      -- individual. A validação de organização e de opt-out vive lá.
      -- Atribuição direta do valor de retorno (correção do erro `column "id"`).
      v_result := public.prospect_management_action(v_id, p_action, p_reason);

      applied := true;
      prospect_id := v_result.id;
      commercial_status := v_result.commercial_status;
      enrichment_status := v_result.enrichment_status;
      opt_out := v_result.opt_out;
      error := null;
      v_applied_count := v_applied_count + 1;
    exception when others then
      -- Um item inválido (ex.: opt-out irreversível, prospect inexistente) não
      -- interrompe os restantes. Reportamos o motivo sem silenciar a falha.
      applied := false;
      prospect_id := v_id;
      commercial_status := null;
      enrichment_status := null;
      opt_out := null;
      error := sqlerrm;
      v_failed_count := v_failed_count + 1;
    end;
    return next;
  end loop;

  -- Registo-resumo do lote (a auditoria por item já existe individualmente).
  perform public.crm_audit('prospect_management_action_bulk', 'prospect_company', null,
    jsonb_build_object(
      'action', p_action,
      'requested', cardinality(p_ids),
      'applied', v_applied_count,
      'failed', v_failed_count,
      'reason', p_reason
    ));

  return;
end;
$$;

revoke all on function public.prospect_management_action_bulk(uuid[], text, text) from public;
grant execute on function public.prospect_management_action_bulk(uuid[], text, text) to authenticated;
