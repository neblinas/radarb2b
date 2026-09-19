-- Radar B2B — Ações de gestão de comissões (admin/gestor).
-- Run once in Supabase SQL Editor as project owner.
--
--   commercial_attribute_client : atribui (ou reatribui) um cliente a um comercial
--   commercial_my_referral_code : devolve o código de referência do utilizador
--   commercial_team_attributions: lista atribuições da equipa (para o gestor)
--   commercial_approve_commission / commercial_mark_paid / commercial_cancel_commission
--   commercial_team_earnings : extrato da equipa para o gestor/admin

-- Atribui manualmente um cliente a um comercial e gera/atualiza as comissões.
create or replace function public.commercial_attribute_client(
  p_client_user_id uuid,
  p_commercial_user_id uuid,
  p_method text default 'manual'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_client_email text;
  v_attr_id uuid;
  v_sub record;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'Apenas administradores ou gestores podem atribuir clientes.';
  end if;

  v_org := public.crm_organization_id();

  select email into v_client_email from auth.users where id = p_client_user_id;
  if v_client_email is null then raise exception 'Cliente inexistente.'; end if;

  insert into public.commercial_attributions
    (organization_id, client_user_id, commercial_user_id, method, status, approved_by, approved_at, updated_at)
  values
    (v_org, p_client_user_id, p_commercial_user_id, p_method, 'active', auth.uid(), now(), now())
  on conflict (organization_id, client_user_id)
  do update set commercial_user_id = excluded.commercial_user_id, method = excluded.method,
                status = 'active', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  returning id into v_attr_id;

  -- Reprocessa comissões das subscrições do cliente (idempotente).
  for v_sub in select id from public.subscriptions where user_id = p_client_user_id loop
    perform public.commission_sync_subscription(v_sub.id, null, null);
  end loop;

  return v_attr_id;
end;
$$;

-- Devolve o código de referência do utilizador autenticado (cria se não existir).
create or replace function public.commercial_my_referral_code()
returns text
language sql security definer set search_path = public as $$
  select public.commercial_ensure_referral_code(auth.uid());
$$;

-- Extrato de comissões da equipa (para gestor/admin).
create or replace function public.commercial_team_earnings()
returns table (
  id uuid,
  created_at timestamptz,
  beneficiary_email text,
  commission_type text,
  kind text,
  level integer,
  amount numeric,
  status text,
  client_email text,
  note text
)
language sql stable security definer set search_path = public as $$
  select
    ledger.id, ledger.created_at, beneficiary_user.email, ledger.commission_type,
    ledger.kind, ledger.level, ledger.amount, ledger.status, client_user.email, ledger.note
  from public.commercial_commission_ledger ledger
  left join auth.users beneficiary_user on beneficiary_user.id = ledger.beneficiary_id
  left join auth.users client_user on client_user.id = ledger.client_user_id
  where ledger.organization_id = public.crm_organization_id()
    and (
      ledger.beneficiary_id = auth.uid()
      or exists (select 1 from public.organization_members m where m.user_id = ledger.beneficiary_id and m.manager_id = auth.uid())
      or public.crm_has_role(array['admin', 'commercial_manager'])
    )
  order by ledger.created_at desc;
$$;

-- Marca uma comissão como paga.
create or replace function public.commercial_mark_paid(p_commission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'Sem permissão.';
  end if;
  update public.commercial_commission_ledger
    set status = 'paid', paid_at = now()
    where id = p_commission_id and organization_id = public.crm_organization_id();
end;
$$;

-- Aprova uma comissão (passa de pending a approved).
create or replace function public.commercial_approve_commission(p_commission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'Sem permissão.';
  end if;
  update public.commercial_commission_ledger
    set status = 'approved'
    where id = p_commission_id and organization_id = public.crm_organization_id() and status = 'pending';
end;
$$;

-- Cancela uma comissão (clawback / correção).
create or replace function public.commercial_cancel_commission(p_commission_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'Sem permissão.';
  end if;
  update public.commercial_commission_ledger
    set status = 'cancelled', note = coalesce(p_reason, note)
    where id = p_commission_id and organization_id = public.crm_organization_id();
end;
$$;

grant execute on function public.commercial_attribute_client(uuid, uuid, text) to authenticated;
grant execute on function public.commercial_my_referral_code() to authenticated;
grant execute on function public.commercial_team_earnings() to authenticated;
grant execute on function public.commercial_mark_paid(uuid) to authenticated;
grant execute on function public.commercial_approve_commission(uuid) to authenticated;
grant execute on function public.commercial_cancel_commission(uuid, text) to authenticated;

-- Opções para a UI de gestão: clientes subscritores e comerciais, com email.
create or replace function public.commercial_admin_options()
returns table (
  kind text,          -- 'client' | 'commercial'
  user_id uuid,
  email text,
  role text
)
language sql stable security definer set search_path = public as $$
  select 'commercial'::text, member.user_id, auth_user.email, member.role
  from public.organization_members member
  left join auth.users auth_user on auth_user.id = member.user_id
  where member.organization_id = public.crm_organization_id()
    and member.role in ('commercial', 'commercial_manager')
    and public.crm_has_role(array['admin', 'commercial_manager'])
  union all
  select 'client'::text, sub.user_id, auth_user.email, null::text
  from public.subscriptions sub
  left join auth.users auth_user on auth_user.id = sub.user_id
  where public.crm_has_role(array['admin', 'commercial_manager']);
$$;

grant execute on function public.commercial_admin_options() to authenticated;
