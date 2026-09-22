-- Adjudata — Prospeção B2B: correção (2) da ação administrativa em lote (FASE 6).
--
-- Porquê esta migração:
--   Depois da correção inicial (`20261008090000_prospecting_management_bulk_fix.sql`),
--   a RPC continuava a falhar com:
--       ERROR: column "id" does not exist (SQLSTATE 42703)
--       CONTEXT: PL/pgSQL function prospect_management_action_bulk ... at FOR over SELECT rows
--
--   Causa raiz (agora identificada com precisão):
--     O loop usava:
--         for v_id in
--           select distinct unnest(p_ids) as id
--           where id is not null
--         loop
--     Dentro de um `FOR ... IN SELECT`, o PL/pgSQL não resolve o alias de saída
--     `id` na cláusula `WHERE` da mesma consulta — daí o erro de resolução da
--     coluna `id`. A construção também era desnecessariamente frágil.
--
--   Correção:
--     Usar `unnest` como expressão de tabela com alias de coluna explícito:
--         for v_id in
--           select distinct pid
--           from unnest(p_ids) as pid
--           where pid is not null
--         loop
--
-- Âmbito:
--   * Recria APENAS `prospect_management_action_bulk` com a mesma assinatura,
--     contrato de retorno e segurança. Mantém a atribuição direta
--     (`v_result := public.prospect_management_action(...)`) da correção anterior.
--   * Nenhuma outra função, tabela ou política é tocada.
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

  -- Normaliza a lista: remove nulos e duplicados, preservando a ordem pedida.
  for v_id in
    select distinct pid
    from unnest(p_ids) as pid
    where pid is not null
  loop
    begin
      -- Cada item passa pela MESMA máquina de transição e auditoria do caso
      -- individual. A validação de organização e de opt-out vive lá.
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
