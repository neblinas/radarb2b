-- Radar B2B — Sales Autopilot: agendamento do worker (FASE 2).
-- Run once in Supabase SQL Editor as project owner.
--
-- O worker é a Edge Function `autopilot-run`. O agendamento pode ser feito de
-- três formas (por ordem de preferência):
--
--   (A) Supabase Cron (pg_cron + pg_net) — se disponível nesta instância.
--   (B) GitHub Actions (já usado pelo pipeline) a chamar a função.
--   (C) Chamada manual pelo back-office.
--
-- Esta migração TENTA configurar (A). Se as extensões/segredos não estiverem
-- disponíveis, NÃO falha: apenas emite um aviso. Ver AUTOPILOT.md.

do $$
declare
  has_cron boolean := false;
  has_net boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into has_net;

  if not has_cron then
    begin
      execute 'create extension if not exists pg_cron';
      has_cron := true;
    exception when others then
      raise notice 'pg_cron indisponível: usar GitHub Actions (ver AUTOPILOT.md).';
    end;
  end if;

  if not has_net then
    begin
      execute 'create extension if not exists pg_net';
      has_net := true;
    exception when others then
      raise notice 'pg_net indisponível: usar GitHub Actions (ver AUTOPILOT.md).';
    end;
  end if;

  if has_cron and has_net then
    raise notice 'pg_cron e pg_net disponíveis. Agendar com:';
    raise notice '  select cron.schedule(''autopilot-run'', ''*/5 * * * *'', $job$ select net.http_post(...) $job$);';
    raise notice 'Requere os segredos SUPABASE_URL e AUTOPILOT_CRON_SECRET no Vault.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trigger de estado do CRM: quando um humano atribui um prospect a si próprio,
-- a automação deixa de o tratar. Registra a transição para auditoria.
-- ---------------------------------------------------------------------------
create or replace function public.automation_on_manual_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_type = 'commercial' and (old.owner_type is distinct from 'commercial') then
    insert into public.automation_events
      (organization_id, prospect_id, from_state, to_state, reason, source, actor_id, metadata)
    values
      (new.organization_id, new.id, old.autopilot_state, 'human_review',
       'atribuído a um comercial (automação suspensa para este prospect)',
       'commercial', auth.uid(), jsonb_build_object('assigned_to', new.assigned_to));
    new.autopilot_state := 'human_review';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_prospects_manual_assignment on public.sales_prospects;
create trigger sales_prospects_manual_assignment
  before update of assigned_to, owner_type on public.sales_prospects
  for each row execute function public.automation_on_manual_assignment();

-- ---------------------------------------------------------------------------
-- RPC de estado do autopilot para o back-office (read-only).
-- ---------------------------------------------------------------------------
create or replace function public.automation_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'organization_id', public.crm_organization_id(),
      'queued_jobs', (select count(*) from public.automation_jobs where organization_id = public.crm_organization_id() and status = 'queued'),
      'processing_jobs', (select count(*) from public.automation_jobs where organization_id = public.crm_organization_id() and status = 'processing'),
      'failed_jobs', (select count(*) from public.automation_jobs where organization_id = public.crm_organization_id() and status = 'failed'),
      'automation_prospects', (select count(*) from public.sales_prospects where organization_id = public.crm_organization_id() and owner_type = 'automation'),
      'by_autopilot_state', coalesce((
        select jsonb_agg(jsonb_build_object('state', autopilot_state, 'count', total) order by total desc)
        from (
          select coalesce(autopilot_state, 'unknown') as autopilot_state, count(*)::integer as total
          from public.sales_prospects
          where organization_id = public.crm_organization_id() and owner_type = 'automation'
          group by 1
        ) grouped
      ), '[]'::jsonb),
      'recent_events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'prospect_id', event.prospect_id,
          'from_state', event.from_state,
          'to_state', event.to_state,
          'reason', event.reason,
          'created_at', event.created_at
        ) order by event.created_at desc)
        from (
          select * from public.automation_events
          where organization_id = public.crm_organization_id()
          order by created_at desc limit 10
        ) event
      ), '[]'::jsonb)
    )
  end;
$$;

grant execute on function public.automation_status() to authenticated;

-- Lista de suppression (back-office).
create or replace function public.automation_suppressions(p_limit integer default 100)
returns table (id uuid, email text, domain text, company_id uuid, reason text, source text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select suppression.id, suppression.email, suppression.domain, suppression.company_id,
         suppression.reason, suppression.source, suppression.created_at
  from public.email_suppressions suppression
  where suppression.organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by suppression.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

grant execute on function public.automation_suppressions(integer) to authenticated;
