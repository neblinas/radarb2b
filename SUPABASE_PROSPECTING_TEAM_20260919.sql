-- Radar B2B prospecting: expose the team roster so managers can see who owns each prospect.
-- Apply after SUPABASE_PROSPECTING_DASHBOARD_20260918.sql.
-- Only managers (admin/commercial_manager) can list the roster. Only user_id and email are returned.

create or replace function public.prospect_team_members()
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select member.user_id, auth_user.email::text as email
  from public.organization_members member
  join auth.users auth_user on auth_user.id = member.user_id
  where member.organization_id = public.crm_organization_id()
    and member.status = 'active'
    and public.crm_has_role(array['admin', 'commercial_manager']);
$$;

grant execute on function public.prospect_team_members() to authenticated;
