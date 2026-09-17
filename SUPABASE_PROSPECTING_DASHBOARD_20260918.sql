-- Apply after SUPABASE_PROSPECTING_MIGRATION.sql and SUPABASE_PROSPECTING_PATCH_20260917.sql.
-- Aggregated metrics for the commercial prospecting dashboard.

create or replace function public.prospect_metrics(p_scope text default 'team')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  organization uuid := public.crm_organization_id();
  result jsonb;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  if p_scope not in ('team', 'mine') then raise exception 'Invalid scope'; end if;

  with scoped as (
    select prospect.*
    from public.sales_prospects prospect
    where prospect.organization_id = organization
      and (p_scope = 'team' or prospect.assigned_to = auth.uid())
  ),
  scored as (
    select
      score.company_id,
      score.name,
      score.nif,
      (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points)::integer as prospect_score
    from public.company_prospect_scores score
  )
  select jsonb_build_object(
    'scope', p_scope,
    'total', (select count(*) from scoped),
    'assigned', (select count(*) from scoped where assigned_to is not null),
    'available', (
      select count(*) from scored
      where not exists (
        select 1 from public.sales_prospects prospect
        where prospect.organization_id = organization
          and prospect.company_id = scored.company_id
          and prospect.assigned_to is not null
      )
    ),
    'overdue', (select count(*) from scoped where next_action_at is not null and next_action_at <= now()),
    'won', (select count(*) from scoped where status = 'WON'),
    'lost', (select count(*) from scoped where status = 'LOST'),
    'do_not_contact', (select count(*) from scoped where status = 'DO_NOT_CONTACT'),
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', total) order by total desc)
      from (select status, count(*)::integer as total from scoped group by status) grouped
    ), '[]'::jsonb),
    'activities_30d', (
      select count(*) from public.sales_activities activity
      where activity.prospect_id in (select id from scoped)
        and activity.occurred_at >= now() - interval '30 days'
    ),
    'top_prospects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'company_id', ranked.company_id,
        'company_name', ranked.name,
        'company_nif', ranked.nif,
        'prospect_score', ranked.prospect_score,
        'status', scoped.status,
        'assigned_to', scoped.assigned_to,
        'next_action_at', scoped.next_action_at
      ) order by ranked.prospect_score desc)
      from (
        select scored.*
        from scored
        join scoped on scoped.company_id = scored.company_id
        order by scored.prospect_score desc
        limit 5
      ) ranked
      left join scoped on scoped.company_id = ranked.company_id
    ), '[]'::jsonb),
    'upcoming_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prospect_id', scoped.id,
        'company_id', scoped.company_id,
        'company_name', scored.name,
        'status', scoped.status,
        'next_action_at', scoped.next_action_at,
        'assigned_to', scoped.assigned_to
      ) order by scoped.next_action_at)
      from scoped
      join scored on scored.company_id = scoped.company_id
      where scoped.next_action_at is not null
      limit 5
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
