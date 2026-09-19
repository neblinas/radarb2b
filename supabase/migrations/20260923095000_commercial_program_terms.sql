-- Radar B2B — Termos do programa comercial (versões + aceitações).
-- Run once in Supabase SQL Editor as project owner.
--
-- O comercial tem de aceitar a versão corrente dos termos do programa antes de
-- poder ver ganhos / ser atribuído. Cada aceitação guarda a versão e o texto
-- aceite (hash), para prova. Alterações futuras dos termos forçam nova aceitação.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Versões dos termos
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_program_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, version)
);

-- ---------------------------------------------------------------------------
-- 2. Aceitações
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_id uuid not null references public.commercial_program_terms(id) on delete restrict,
  terms_version integer not null,
  content_hash text not null,
  accepted_at timestamptz not null default now(),
  user_agent text,
  unique (user_id, terms_version)
);

create index if not exists commercial_terms_acceptances_user_idx
  on public.commercial_terms_acceptances (user_id, accepted_at desc);

-- ---------------------------------------------------------------------------
-- 3. Versão inicial (v1) dos termos, com o mesmo texto das regras v1.
-- ---------------------------------------------------------------------------
insert into public.commercial_program_terms (organization_id, version, title, body)
select organizations.id, 1,
  'Termos do Programa Comercial Radar B2B',
  $terms$PROGRAMA COMERCIAL RADAR B2B — CONDIÇÕES (v1)

1. ÂMBITO
Este programa define as comissões pagas ao comercial pela subscrição de
clientes que traz para o Radar B2B. Aplica-se a comerciais e gestores comerciais.

2. ATRIBUIÇÃO DE CLIENTES
Um cliente é atribuído ao comercial que o traz, por link de referência
(?ref=CODIGO) ou por atribuição manual aprovada pela gestão. O mesmo cliente
só pode estar atribuído a um comercial.

3. COMISSÕES DE VENDA DIRETA
a) Cliente mensal: 100% da 1.ª mensalidade + 10% nos 5 meses seguintes
   (meses 2 a 6), enquanto a subscrição estiver ativa.
b) Cliente anual: 20% da subscrição anual (pagamento único).

4. BÓNUS DE RETENÇÃO
A partir do 7.º mês, o comercial recebe 3% da mensalidade, enquanto o cliente
se mantiver ativo.

5. COMISSÕES DE EQUIPA
a) Cliente mensal: 50% da 2.ª mensalidade para o gestor/mentor do comercial
   que trouxe o cliente (só quando a 2.ª mensalidade é efetivamente paga).
b) Cliente anual: 5% da subscrição anual.
c) Nível 2 (gestor do gestor): 20% da comissão de equipa de nível 1.

6. BÓNUS DE RECRUTAMENTO
Quem recruta um comercial recebe 5% da comissão direta desse recrutado nos
primeiros 6 meses de atividade dele.

7. BASE DE CÁLCULO
Todos os valores são líquidos (sem IVA), em euros. As comissões são calculadas
sobre subscrições pagas e confirmadas.

8. ESTADOS E PAGAMENTO
As comissões passam por pending (à espera do pagamento do cliente) →
approved (pagamento confirmado) → paid (pago ao comercial). O pagamento é
confirmado manualmente pela gestão e fica registado com data.

9. CANCELAMENTO E REVERSÃO (CLAWBACK)
Se o cliente cancelar antes de pagar a 2.ª mensalidade (planos mensais), as
comissões futuras ainda não ganhas são canceladas. As comissões já pagas
mantêm-se. Em caso de chargeback, a gestão pode cancelar movimentos.

10. ALTERAÇÕES E VERSIONAMENTO
As regras são versionadas. Alterações futuras não recalculam comissões já
geradas retroativamente e obrigam à aceitação de uma nova versão destes termos.

11. BOA-FÉ E INDEVIDO PROVEITO
É proibido criar clientes fictícios, forçar atribuições indevidas ou manipular
os mecanismos de comissão. A gestão pode revogar atribuições e cancelar
comissões obtidas de forma indevida.

Ao aceitar, confirmo que li e compreendo estas condições e que aceito que a
minha aceitação fica registada (versão, data e texto) para efeitos de prova.$terms$
from public.organizations organizations
where not exists (
  select 1 from public.commercial_program_terms terms
  where terms.organization_id = organizations.id
);

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------
-- Versão corrente dos termos da organização do utilizador.
create or replace function public.commercial_current_terms()
returns table (
  terms_id uuid,
  version integer,
  title text,
  body text,
  effective_from timestamptz
)
language sql stable security definer set search_path = public as $$
  select terms.id, terms.version, terms.title, terms.body, terms.effective_from
  from public.commercial_program_terms terms
  where terms.organization_id = public.crm_organization_id()
    and terms.active
  order by terms.version desc
  limit 1;
$$;

-- Estado da aceitação do utilizador atual: aceitou a versão corrente?
create or replace function public.commercial_my_terms_status()
returns table (
  accepted boolean,
  accepted_version integer,
  current_version integer
)
language sql stable security definer set search_path = public as $$
  with current_terms as (
    select terms.id, terms.version
    from public.commercial_program_terms terms
    where terms.organization_id = public.crm_organization_id() and terms.active
    order by terms.version desc limit 1
  )
  select
    coalesce(acc.terms_version = current_terms.version, false) as accepted,
    acc.terms_version as accepted_version,
    current_terms.version as current_version
  from current_terms
  left join lateral (
    select a.terms_version from public.commercial_terms_acceptances a
    where a.user_id = auth.uid()
    order by a.terms_version desc limit 1
  ) acc on true;
$$;

-- Regista a aceitação da versão corrente (idempotente).
create or replace function public.commercial_accept_terms(p_user_agent text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_terms record;
  v_hash text;
  v_version integer;
begin
  select terms.id, terms.version, terms.body, terms.organization_id
    into v_terms
    from public.commercial_program_terms terms
    where terms.organization_id = public.crm_organization_id() and terms.active
    order by terms.version desc limit 1;

  if v_terms.id is null then
    raise exception 'No active terms found';
  end if;

  v_hash := encode(digest(v_terms.body, 'sha256'), 'hex');

  insert into public.commercial_terms_acceptances
    (organization_id, user_id, terms_id, terms_version, content_hash, user_agent)
  values
    (v_terms.organization_id, auth.uid(), v_terms.id, v_terms.version, v_hash, p_user_agent)
  on conflict (user_id, terms_version) do nothing;

  select terms_version into v_version
    from public.commercial_terms_acceptances
    where user_id = auth.uid()
    order by terms_version desc limit 1;

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.commercial_program_terms enable row level security;
alter table public.commercial_terms_acceptances enable row level security;

drop policy if exists program_terms_select on public.commercial_program_terms;
create policy program_terms_select on public.commercial_program_terms
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

drop policy if exists terms_acceptances_select on public.commercial_terms_acceptances;
create policy terms_acceptances_select on public.commercial_terms_acceptances
  for select using (
    user_id = auth.uid()
    or public.crm_has_role(array['admin', 'commercial_manager'])
  );

grant execute on function public.commercial_current_terms() to authenticated;
grant execute on function public.commercial_my_terms_status() to authenticated;
grant execute on function public.commercial_accept_terms(text) to authenticated;
