-- ================================================================
-- inProR Painel -- Gestor de Projetos
-- Migracao: tabela projects + vinculo com tasks
-- Cole no Supabase Dashboard > SQL Editor e rode (apos supabase-setup.sql)
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- ── projects ─────────────────────────────────────────────────
-- client_id nulo = projeto interno da agencia
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'planejamento'
              check (status in ('planejamento','em_andamento','pausado','concluido','cancelado')),
  priority    text default 'media' check (priority in ('baixa','media','alta','urgente')),
  start_date  date,
  due_date    date,
  budget      numeric(12,2),
  owner       text,
  color       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- ── tasks: vinculo com projeto ───────────────────────────────
alter table tasks add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists tasks_project_id_idx on tasks(project_id);
create index if not exists projects_client_id_idx on projects(client_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table projects enable row level security;

drop policy if exists "admin_all_projects" on projects;
create policy "admin_all_projects" on projects for all to authenticated using (is_admin());

drop policy if exists "client_own_projects" on projects;
create policy "client_own_projects" on projects for select to authenticated
  using (client_id = my_client_id());

-- ================================================================
-- Seed opcional: 2 projetos demo para o restaurante de teste.
-- Remova este bloco se nao quiser dados de exemplo.
-- ================================================================
insert into projects (id, client_id, name, description, status, priority, start_date, due_date, budget, owner)
values
  ('22222222-2222-2222-2222-222222222221',
   '11111111-1111-1111-1111-111111111111',
   'Lancamento do delivery proprio',
   'Tirar o restaurante da dependencia exclusiva do iFood: cardapio digital proprio, campanha de captacao e fluxo de recompra.',
   'em_andamento', 'alta', '2026-07-01', '2026-09-30', 12000.00, 'Richard'),
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Recuperacao da nota no iFood',
   'Plano de resposta a avaliacoes negativas e ajuste de operacao para subir a nota acima de 4.7.',
   'planejamento', 'urgente', '2026-08-01', '2026-10-15', 4500.00, 'Richard')
on conflict (id) do nothing;

-- Tarefas de exemplo ligadas aos projetos acima
insert into tasks (client_id, project_id, title, description, status, priority, due_date, assigned_to)
select * from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222221'::uuid,
   'Definir estrutura do cardapio digital', 'Categorias, fotos e descricoes dos pratos.', 'concluida', 'alta', '2026-07-10'::date, 'Richard'),
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222221'::uuid,
   'Configurar dominio e link na bio', null, 'em_andamento', 'media', '2026-08-05'::date, 'Richard'),
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222221'::uuid,
   'Campanha de captacao Meta Ads', 'Publico de 5km com foco em primeira compra.', 'backlog', 'alta', '2026-08-20'::date, null),
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'Mapear avaliacoes negativas do trimestre', null, 'backlog', 'urgente', '2026-08-10'::date, null),
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'Criar templates de resposta padrao', null, 'backlog', 'media', '2026-08-15'::date, null)
) as t(client_id, project_id, title, description, status, priority, due_date, assigned_to)
where not exists (select 1 from tasks where project_id = '22222222-2222-2222-2222-222222222221');
