create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  category text not null default 'Suporte geral',
  subject text not null,
  message text not null check (length(trim(message)) >= 20),
  consent boolean not null default false check (consent = true),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_requests_created_idx on public.support_requests (created_at desc);
alter table public.support_requests enable row level security;
drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert on public.support_requests for insert with check (consent = true and (user_id is null or user_id = auth.uid()));
drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select on public.support_requests for select using (user_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager', 'commercial']));
