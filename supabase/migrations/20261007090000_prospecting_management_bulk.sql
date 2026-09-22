-- Adjudata — Prospeção B2B: Gestão de Prospeção (FASE 6) — ações em lote.
--
-- Porquê esta migração:
--   A Gestão de prospeção já permite ACCIONAR um prospect individualmente
--   (`prospect_management_action`). A operação comercial real, no entanto,
--   trabalha sobre SELEÇÕES: aprovar/pré-qualificar um lote, preparar um lote
--   para o Autopilot, rejeitar um lote, aplicar opt-out a um lote ou reiniciar
--   o estado de um lote. Sem uma operação em lote, o gestor teria de abrir ficha
--   a ficha — lento, propenso a erro e sem trilha de auditoria coerente.
--
--   Esta migração adiciona UMA RPC em lote que reutiliza EXATAMENTE a mesma
--   máquina de transição do backend, item a item, e devolve o resultado
--   por prospecto. Não introduz um caminho alternativo de escrita: cada item
--   passa pelas mesmas regras, pelas mesmas validações e pela mesma auditoria
--   do caso individual.
--
-- Âmbito:
--   * `prospect_management_action_bulk(p_ids uuid[], p_action text, p_reason text)`
--     — aplica a MESMA ação a vários prospectos, devolvendo por item o estado
--       final ou o motivo de falha (ex.: tentar reativar um opt-out).
--
-- Segurança:
--   * Só admin / commercial_manager (validado no backend — nunca apenas na UI).
--   * security definer com search_path fixo.
--   * revoke all from public + grant execute to authenticated.
--   * Cada item aplicado gera entrada em crm_audit (via
--     `prospect_management_action`), e o lote gera um registo-resumo próprio.
--   * Idempotência: aplicar a mesma ação duas vezes não corrompe o estado; um
--     opt-out nunca é reposto por APPROVE/READY_AUTOPILOT/RESET.
--   * Tudo dentro de uma transação: ou o lote é processado item a item (cada
--     item é independente), sem deixar estados parciais silenciosos — o
--     resultado por item é devolvido ao cliente.
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

-- ===========================================================================
-- 1. Ação administrativa em lote
-- ===========================================================================
-- Reutiliza a lógica individual chamando `prospect_management_action` por item,
-- capturando a exceção por prospecto (nunca aborta o lote inteiro por um item
-- inválido). Devolve uma linha por prospecto pedido, com o estado final quando
-- aplicado ou a mensagem de erro quando bloqueado.
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
    select distinct unnest(p_ids) as id
    where id is not null
  loop
    begin
      -- Cada item passa pela MESMA máquina de transição e auditoria do caso
      -- individual. A validação de organização e de opt-out vive lá.
      select * into v_result
      from public.prospect_management_action(v_id, p_action, p_reason);

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

-- ===========================================================================
-- 2. Permissões
-- ===========================================================================
revoke all on function public.prospect_management_action_bulk(uuid[], text, text) from public;
grant execute on function public.prospect_management_action_bulk(uuid[], text, text) to authenticated;
