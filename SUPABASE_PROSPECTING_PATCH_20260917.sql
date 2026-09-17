-- Apply after SUPABASE_PROSPECTING_MIGRATION.sql.
-- Persists the explainable score snapshot when a prospect is claimed.

create or replace function public.prospect_claim(p_company_id uuid)
returns public.sales_prospects language plpgsql security definer set search_path = public as $$
declare prospect public.sales_prospects;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  insert into public.sales_prospects (organization_id, company_id, assigned_to, assigned_by, assigned_at, last_activity_at)
  values (public.crm_organization_id(), p_company_id, auth.uid(), auth.uid(), now(), now())
  on conflict (organization_id, company_id) do nothing;
  select * into prospect from public.sales_prospects where organization_id = public.crm_organization_id() and company_id = p_company_id for update;
  if prospect.assigned_to is not null and prospect.assigned_to <> auth.uid() and not public.crm_has_role(array['admin', 'commercial_manager']) then raise exception 'Prospect already assigned'; end if;
  if prospect.assigned_to is distinct from auth.uid() then
    insert into public.sales_assignment_history (prospect_id, from_sales_rep, to_sales_rep, changed_by, reason) values (prospect.id, prospect.assigned_to, auth.uid(), auth.uid(), 'claimed');
    update public.sales_prospects set assigned_to=auth.uid(), assigned_by=auth.uid(), assigned_at=now(), last_activity_at=now(), updated_at=now() where id=prospect.id returning * into prospect;
  end if;
  insert into public.sales_prospect_score_components (prospect_id, component, points, metadata)
  select prospect.id, component, points, jsonb_build_object('detail', detail)
  from public.prospect_score_components(p_company_id)
  on conflict (prospect_id, component) do update set points=excluded.points, metadata=excluded.metadata, calculated_at=now();
  perform public.crm_audit('prospect_claimed', 'sales_prospect', prospect.id, jsonb_build_object('company_id', p_company_id));
  return prospect;
end;
$$;
