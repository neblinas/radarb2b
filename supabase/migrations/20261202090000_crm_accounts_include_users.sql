-- O back-office de contas também deve mostrar utilizadores criados por signup.
-- A lista continua a ser exposta apenas a admin/gestor através de RPC protegida.
create or replace function public.crm_admin_accounts()
returns table (user_id uuid, email text, role text, account_status text)
language sql stable security definer set search_path = public
as $$
  select
    auth_user.id,
    auth_user.email,
    member.role,
    coalesce(member.status, 'active')
  from auth.users auth_user
  left join public.organization_members member
    on member.user_id = auth_user.id
   and member.organization_id = public.crm_organization_id()
  where public.crm_has_role(array['admin', 'commercial_manager'])
    and auth_user.deleted_at is null
  order by auth_user.email nulls last;
$$;

revoke all on function public.crm_admin_accounts() from public;
grant execute on function public.crm_admin_accounts() to authenticated;
