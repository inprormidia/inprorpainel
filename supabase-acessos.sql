-- ================================================================
-- inProR Painel -- Acesso da equipe: papel, clientes e modulos
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer os SQLs anteriores aplicados.
-- Seguro para rodar mais de uma vez.
--
-- Cria um terceiro papel, "agency", para quem trabalha na agencia:
--   admin  -> ve e faz tudo
--   agency -> ve apenas os clientes atribuidos e os modulos liberados
--   client -> ve apenas os proprios dados (restaurante)
--
-- A restricao real vive aqui nas policies. O frontend apenas
-- reflete o que estas regras ja garantem.
-- ================================================================

-- ── Papel agency aceito em user_roles ────────────────────────
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add constraint user_roles_role_check
  check (role in ('admin','agency','client'));

-- ── Modulos liberados por membro ─────────────────────────────
-- Financeiro, clientes e equipe ficam de fora do padrao.
alter table team_members add column if not exists modules text[]
  default array['tarefas','projetos','delivery','reputacao','trafego-pago',
                'social','cardapio','relatorios','reunioes','estrategias','metas-kpis'];

update team_members set modules = array['tarefas','projetos','delivery','reputacao',
  'trafego-pago','social','cardapio','relatorios','reunioes','estrategias','metas-kpis']
where modules is null;

-- ── Quais clientes cada membro atende ────────────────────────
create table if not exists member_clients (
  member_id  uuid not null references team_members(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (member_id, client_id)
);
create index if not exists member_clients_member_idx on member_clients(member_id);

alter table member_clients enable row level security;

drop policy if exists "admin_all_member_clients" on member_clients;
create policy "admin_all_member_clients" on member_clients for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "member_read_own_clients" on member_clients;
create policy "member_read_own_clients" on member_clients for select to authenticated
  using (member_id = my_member_id());

-- ── Helpers de permissao ─────────────────────────────────────
create or replace function is_agency() returns boolean language sql stable as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'agency')
$$;

-- Clientes que o usuario logado pode enxergar
create or replace function my_client_ids() returns setof uuid language sql stable as $$
  select mc.client_id
  from member_clients mc
  where mc.member_id = my_member_id()
$$;

-- Regra central: este usuario pode ver dados deste cliente?
create or replace function can_see_client(cid uuid) returns boolean language sql stable as $$
  select case
    when is_admin() then true
    when cid is null then is_admin() or is_agency()          -- registros internos da agencia
    when is_agency() then cid in (select my_client_ids())
    else cid = my_client_id()
  end
$$;

-- Um membro da agencia sempre enxerga o que foi atribuido a ele,
-- mesmo que seja de um cliente fora do escopo dele.
create or replace function is_my_task(tid uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from task_assignees ta
    where ta.task_id = tid and ta.member_id = my_member_id()
  )
$$;

-- ================================================================
-- Policies por tabela
-- ================================================================

-- ── clients ──────────────────────────────────────────────────
drop policy if exists "admin_all_clients"  on clients;
drop policy if exists "client_own_client"  on clients;
drop policy if exists "scoped_read_clients" on clients;
drop policy if exists "admin_write_clients" on clients;

create policy "admin_write_clients" on clients for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "scoped_read_clients" on clients for select to authenticated
  using (can_see_client(id));

-- ── tasks ────────────────────────────────────────────────────
drop policy if exists "admin_all_tasks"   on tasks;
drop policy if exists "client_own_tasks"  on tasks;
drop policy if exists "scoped_read_tasks" on tasks;
drop policy if exists "agency_write_tasks" on tasks;

create policy "scoped_read_tasks" on tasks for select to authenticated
  using (can_see_client(client_id) or is_my_task(id));

-- Equipe cria e edita tarefas dentro do escopo dela
create policy "agency_write_tasks" on tasks for all to authenticated
  using (is_admin() or (is_agency() and (can_see_client(client_id) or is_my_task(id))))
  with check (is_admin() or (is_agency() and can_see_client(client_id)));

-- ── task_assignees ───────────────────────────────────────────
drop policy if exists "admin_all_task_assignees"  on task_assignees;
drop policy if exists "client_read_task_assignees" on task_assignees;
drop policy if exists "scoped_task_assignees"     on task_assignees;

create policy "scoped_task_assignees" on task_assignees for all to authenticated
  using (
    is_admin() or exists (
      select 1 from tasks t where t.id = task_assignees.task_id
        and (can_see_client(t.client_id) or is_my_task(t.id))
    )
  )
  with check (
    is_admin() or (is_agency() and exists (
      select 1 from tasks t where t.id = task_assignees.task_id
        and can_see_client(t.client_id)
    ))
  );

-- ── projects ─────────────────────────────────────────────────
drop policy if exists "admin_all_projects"   on projects;
drop policy if exists "client_own_projects"  on projects;
drop policy if exists "scoped_read_projects" on projects;
drop policy if exists "agency_write_projects" on projects;

create policy "scoped_read_projects" on projects for select to authenticated
  using (can_see_client(client_id));
create policy "agency_write_projects" on projects for all to authenticated
  using (is_admin() or (is_agency() and can_see_client(client_id)))
  with check (is_admin() or (is_agency() and can_see_client(client_id)));

-- ── team_members ─────────────────────────────────────────────
-- Leitura liberada (precisa para exibir nomes e avatares).
-- Cadastro e edicao continuam so do admin.
drop policy if exists "read_team"       on team_members;
drop policy if exists "admin_write_team" on team_members;
create policy "read_team" on team_members for select to authenticated using (true);
create policy "admin_write_team" on team_members for all to authenticated
  using (is_admin()) with check (is_admin());

-- ── faturas: financeiro e exclusivo do admin ─────────────────
drop policy if exists "admin_all_faturas"  on faturas;
drop policy if exists "client_own_faturas" on faturas;
drop policy if exists "faturas_admin_only" on faturas;
drop policy if exists "faturas_client_read" on faturas;

create policy "faturas_admin_only" on faturas for all to authenticated
  using (is_admin()) with check (is_admin());
-- o proprio cliente continua vendo as faturas dele
create policy "faturas_client_read" on faturas for select to authenticated
  using (client_id = my_client_id());

-- ── Demais tabelas de dados do cliente ───────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'ads_metrics','delivery_metrics','reputation_metrics','articles',
    'meetings','reports','client_briefing','client_goals','client_kpis'
  ]
  loop
    execute format('drop policy if exists "admin_all_%1$s" on %1$I', t);
    execute format('drop policy if exists "client_own_%1$s" on %1$I', t);
    execute format('drop policy if exists "scoped_read_%1$s" on %1$I', t);
    execute format('drop policy if exists "scoped_write_%1$s" on %1$I', t);

    -- nomes antigos usados no setup inicial
    execute format('drop policy if exists "admin_all_ads" on %1$I', t);
    execute format('drop policy if exists "client_own_ads" on %1$I', t);
    execute format('drop policy if exists "admin_all_delivery" on %1$I', t);
    execute format('drop policy if exists "client_own_delivery" on %1$I', t);
    execute format('drop policy if exists "admin_all_reputation" on %1$I', t);
    execute format('drop policy if exists "client_own_reputation" on %1$I', t);
    execute format('drop policy if exists "admin_all_articles" on %1$I', t);
    execute format('drop policy if exists "client_own_articles" on %1$I', t);
    execute format('drop policy if exists "admin_all_meetings" on %1$I', t);
    execute format('drop policy if exists "client_own_meetings" on %1$I', t);
    execute format('drop policy if exists "admin_all_reports" on %1$I', t);
    execute format('drop policy if exists "client_own_reports" on %1$I', t);
    execute format('drop policy if exists "admin_all_briefing" on %1$I', t);
    execute format('drop policy if exists "client_own_briefing" on %1$I', t);
    execute format('drop policy if exists "admin_all_goals" on %1$I', t);
    execute format('drop policy if exists "client_own_goals" on %1$I', t);
    execute format('drop policy if exists "admin_all_kpis" on %1$I', t);
    execute format('drop policy if exists "client_own_kpis" on %1$I', t);

    execute format(
      'create policy "scoped_read_%1$s" on %1$I for select to authenticated
         using (can_see_client(client_id))', t);
    execute format(
      'create policy "scoped_write_%1$s" on %1$I for all to authenticated
         using (is_admin() or (is_agency() and can_see_client(client_id)))
         with check (is_admin() or (is_agency() and can_see_client(client_id)))', t);
  end loop;
end $$;

-- ================================================================
-- Como liberar acesso a uma pessoa da equipe
--
-- 1. Convide pelo painel, em Equipe, ou crie o usuario em
--    Authentication > Users.
--
-- 2. Ligue o login ao membro e defina o papel:
--
--    update team_members set user_id = '<UUID-DO-AUTH>' where name = 'Camili';
--    insert into user_roles (user_id, role) values ('<UUID-DO-AUTH>', 'agency')
--      on conflict (user_id) do update set role = 'agency', client_id = null;
--
-- 3. Atribua os clientes na pagina Equipe, ou por SQL:
--
--    insert into member_clients (member_id, client_id)
--    select m.id, c.id from team_members m, clients c
--    where m.name = 'Camili' and c.name like 'Estacao Granada%'
--    on conflict do nothing;
-- ================================================================

select m.name, m.modules,
       (select count(*) from member_clients mc where mc.member_id = m.id) as clientes
from team_members m order by m.name;
