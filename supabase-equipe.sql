-- ================================================================
-- inProR Painel -- Equipe e atribuicao de tarefas
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer supabase-setup.sql e supabase-projects.sql aplicados antes.
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- ── team_members ─────────────────────────────────────────────
-- Membro da equipe da agencia. user_id e opcional: permite cadastrar
-- quem ainda nao tem login e ligar depois.
create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  name        text not null,
  email       text,
  role_title  text,
  color       text default '#0C2118',
  active      boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists team_members_updated_at on team_members;
create trigger team_members_updated_at before update on team_members
  for each row execute function set_updated_at();

-- ── tasks: responsavel como referencia ───────────────────────
-- A coluna de texto assigned_to continua existindo como historico.
alter table tasks add column if not exists assignee_id uuid references team_members(id) on delete set null;

-- ── Indices (consultas da pagina de tarefas) ─────────────────
create index if not exists tasks_assignee_id_idx on tasks(assignee_id);
create index if not exists tasks_status_idx      on tasks(status);
create index if not exists tasks_due_date_idx    on tasks(due_date);
create index if not exists tasks_client_id_idx   on tasks(client_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table team_members enable row level security;

-- Todos os autenticados leem a equipe (para exibir nomes nas tarefas)
drop policy if exists "read_team" on team_members;
create policy "read_team" on team_members for select to authenticated using (true);

-- Somente admin cadastra e edita
drop policy if exists "admin_write_team" on team_members;
create policy "admin_write_team" on team_members for all to authenticated
  using (is_admin()) with check (is_admin());

-- ── Helper: o membro correspondente ao usuario logado ────────
create or replace function my_member_id() returns uuid language sql stable as $$
  select id from team_members where user_id = auth.uid() limit 1
$$;

-- ================================================================
-- Migracao: transforma os responsaveis em texto que ja existem
-- em membros da equipe e religa as tarefas a eles.
-- ================================================================
insert into team_members (name, color)
select distinct trim(assigned_to), '#0C2118'
from tasks
where assigned_to is not null
  and trim(assigned_to) <> ''
  and not exists (
    select 1 from team_members m where lower(m.name) = lower(trim(tasks.assigned_to))
  );

update tasks t
set assignee_id = m.id
from team_members m
where t.assignee_id is null
  and t.assigned_to is not null
  and lower(trim(t.assigned_to)) = lower(m.name);

-- ================================================================
-- Vincule seu proprio login ao seu membro da equipe.
-- Descubra seu UUID em Authentication > Users e rode:
--
--   update team_members set user_id = '<SEU-UUID-AUTH>' where name = 'Richard';
--
-- Sem esse vinculo o atalho "Minhas tarefas" nao tem como saber
-- qual membro e voce.
-- ================================================================

select name, role_title, active, user_id from team_members order by name;
