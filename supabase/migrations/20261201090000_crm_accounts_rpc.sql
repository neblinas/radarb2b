-- Lista as contas CRM sem expor auth.users ao browser.
create or replace function public.crm_admin_accounts()
returns table (user_id uuid, email text, role text, account_status text)
language sql stable security definer set search_path = public
as $$
  select member.user_id, auth_user.email, member.role, member.status
  from public.organization_members member
  join auth.users auth_user on auth_user.id = member.user_id
  where member.organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager', 'commercial'])
  order by auth_user.email nulls last;
$$;

revoke all on function public.crm_admin_accounts() from public;
grant execute on function public.crm_admin_accounts() to authenticated;
