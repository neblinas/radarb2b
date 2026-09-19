-- Radar B2B — Corrige o hash da aceitação dos termos.
-- Run once in Supabase SQL Editor as project owner.
--
-- BUG: digest(...) não está no search_path=public (o pgcrypto vive noutro
-- schema no Supabase), causando "function digest(text, unknown) does not exist".
-- Usa-se md5() (built-in) para o hash de integridade do texto aceite — chega
-- para prova/auditoria e não depende de extensões.

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

  v_hash := md5(v_terms.body);

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

grant execute on function public.commercial_accept_terms(text) to authenticated;
