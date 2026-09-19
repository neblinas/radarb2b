-- Radar B2B — Termos do programa comercial: leitura pública.
-- Run once in Supabase SQL Editor as project owner.
--
-- Permite mostrar os termos numa página pública (/programa-comercial) sem
-- login, devolvendo apenas a versão corrente (título, texto, versão).

create or replace function public.commercial_program_terms_public()
returns table (
  version integer,
  title text,
  body text,
  effective_from timestamptz
)
language sql stable security definer set search_path = public as $$
  select terms.version, terms.title, terms.body, terms.effective_from
  from public.commercial_program_terms terms
  where terms.active
  order by terms.version desc
  limit 1;
$$;

grant execute on function public.commercial_program_terms_public() to anon, authenticated;
