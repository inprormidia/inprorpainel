-- ================================================================
-- inProR Painel -- Varios clientes por tarefa, duplicar e repetir
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer os SQLs anteriores aplicados.
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- ================================================================
-- 1. Varios clientes na mesma tarefa
-- Util quando a mesma entrega atende varias unidades.
-- A coluna client_id continua existindo como cliente principal.
-- ================================================================
create table if not exists task_clients (
  task_id    uuid not null references tasks(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (task_id, client_id)
);
create index if not exists task_clients_task_idx   on task_clients(task_id);
create index if not exists task_clients_client_idx on task_clients(client_id);

-- Traz o vinculo atual para a nova tabela
insert into task_clients (task_id, client_id)
select id, client_id from tasks where client_id is not null
on conflict do nothing;

-- ── Quem pode ver a tarefa ───────────────────────────────────
-- Se a tarefa tem clientes vinculados, a visibilidade vem deles.
-- Sem nenhum vinculo, vale o campo antigo (tarefa interna da agencia).
create or replace function can_see_task(tid uuid, cid uuid) returns boolean
language sql stable as $$
  select case
    when is_admin() then true
    when exists (select 1 from task_clients tc where tc.task_id = tid) then
      exists (
        select 1 from task_clients tc
        where tc.task_id = tid and can_see_client(tc.client_id)
      )
    else can_see_client(cid)
  end
$$;

alter table task_clients enable row level security;

drop policy if exists "read_task_clients" on task_clients;
create policy "read_task_clients" on task_clients for select to authenticated
  using (is_admin() or can_see_client(client_id) or is_my_task(task_id));

drop policy if exists "write_task_clients" on task_clients;
create policy "write_task_clients" on task_clients for all to authenticated
  using (is_admin() or (is_agency() and can_see_client(client_id)))
  with check (is_admin() or (is_agency() and can_see_client(client_id)));

-- ── Policies de tasks passam a considerar varios clientes ────
drop policy if exists "scoped_read_tasks"  on tasks;
drop policy if exists "agency_write_tasks" on tasks;

create policy "scoped_read_tasks" on tasks for select to authenticated
  using (can_see_task(id, client_id) or is_my_task(id));

create policy "agency_write_tasks" on tasks for all to authenticated
  using (is_admin() or (is_agency() and (can_see_task(id, client_id) or is_my_task(id))))
  with check (is_admin() or (is_agency() and can_see_task(id, client_id)));

-- Comentarios e anexos seguem a mesma regra da tarefa
drop policy if exists "read_task_comments" on task_comments;
create policy "read_task_comments" on task_comments for select to authenticated
  using (exists (
    select 1 from tasks t where t.id = task_comments.task_id
      and (can_see_task(t.id, t.client_id) or is_my_task(t.id))
  ));

drop policy if exists "write_task_comments" on task_comments;
create policy "write_task_comments" on task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from tasks t where t.id = task_comments.task_id
        and (can_see_task(t.id, t.client_id) or is_my_task(t.id))
    )
  );

drop policy if exists "read_task_attachments" on task_attachments;
create policy "read_task_attachments" on task_attachments for select to authenticated
  using (exists (
    select 1 from tasks t where t.id = task_attachments.task_id
      and (can_see_task(t.id, t.client_id) or is_my_task(t.id))
  ));

drop policy if exists "write_task_attachments" on task_attachments;
create policy "write_task_attachments" on task_attachments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from tasks t where t.id = task_attachments.task_id
        and (can_see_task(t.id, t.client_id) or is_my_task(t.id))
    )
  );

-- ================================================================
-- 2. Tarefa que se repete
-- Ao concluir, o proprio banco cria a proxima ocorrencia. Assim
-- funciona mesmo que a conclusao venha de fora do painel.
-- ================================================================
alter table tasks add column if not exists repeat_rule text
  check (repeat_rule in ('diaria','semanal','quinzenal','mensal','anual'));
alter table tasks add column if not exists repeat_until date;
-- guarda de qual tarefa esta veio, para historico
alter table tasks add column if not exists repeat_origin uuid references tasks(id) on delete set null;

create or replace function proxima_data(base date, regra text) returns date
language sql immutable as $$
  select case regra
    when 'diaria'    then base + interval '1 day'
    when 'semanal'   then base + interval '7 days'
    when 'quinzenal' then base + interval '14 days'
    when 'mensal'    then base + interval '1 month'
    when 'anual'     then base + interval '1 year'
    else null
  end::date
$$;

create or replace function repete_tarefa() returns trigger language plpgsql as $repete$
declare
  nova_id   uuid;
  base      date;
  proxima   date;
begin
  -- so quando acabou de ser concluida e tem regra de repeticao
  if new.status <> 'concluida' or coalesce(old.status,'') = 'concluida' then
    return new;
  end if;
  if new.repeat_rule is null then
    return new;
  end if;

  base := coalesce(new.due_date, current_date);
  proxima := proxima_data(base, new.repeat_rule);

  -- nunca deixa a proxima nascer no passado
  while proxima is not null and proxima < current_date loop
    proxima := proxima_data(proxima, new.repeat_rule);
  end loop;

  if proxima is null then return new; end if;
  if new.repeat_until is not null and proxima > new.repeat_until then return new; end if;

  insert into tasks (
    client_id, project_id, department_id, title, description,
    status, priority, due_date, assigned_to, assignee_id,
    repeat_rule, repeat_until, repeat_origin
  ) values (
    new.client_id, new.project_id, new.department_id, new.title, new.description,
    'backlog', new.priority, proxima, new.assigned_to, new.assignee_id,
    new.repeat_rule, new.repeat_until, coalesce(new.repeat_origin, new.id)
  ) returning id into nova_id;

  -- leva junto responsaveis e clientes
  insert into task_assignees (task_id, member_id)
  select nova_id, member_id from task_assignees where task_id = new.id
  on conflict do nothing;

  insert into task_clients (task_id, client_id)
  select nova_id, client_id from task_clients where task_id = new.id
  on conflict do nothing;

  return new;
end;
$repete$;

drop trigger if exists tasks_repete on tasks;
create trigger tasks_repete after update of status on tasks
  for each row execute function repete_tarefa();

-- ================================================================
-- 3. Duplicar tarefa
-- Feito no banco para copiar responsaveis e clientes numa so ida.
-- ================================================================
create or replace function duplicar_tarefa(origem uuid, novo_titulo text default null)
returns uuid language plpgsql security invoker as $dup$
declare
  t      tasks%rowtype;
  nova   uuid;
begin
  select * into t from tasks where id = origem;
  if not found then
    raise exception 'Tarefa nao encontrada';
  end if;

  insert into tasks (
    client_id, project_id, department_id, title, description,
    status, priority, due_date, assigned_to, assignee_id,
    repeat_rule, repeat_until
  ) values (
    t.client_id, t.project_id, t.department_id,
    coalesce(novo_titulo, t.title || ' (copia)'), t.description,
    'backlog', t.priority, t.due_date, t.assigned_to, t.assignee_id,
    t.repeat_rule, t.repeat_until
  ) returning id into nova;

  insert into task_assignees (task_id, member_id)
  select nova, member_id from task_assignees where task_id = origem
  on conflict do nothing;

  insert into task_clients (task_id, client_id)
  select nova, client_id from task_clients where task_id = origem
  on conflict do nothing;

  return nova;
end;
$dup$;

grant execute on function duplicar_tarefa(uuid, text) to authenticated;

-- ── Conferencia ──────────────────────────────────────────────
select
  (select count(*) from task_clients) as vinculos_de_cliente,
  (select count(*) from tasks where repeat_rule is not null) as tarefas_repetidas;

-- ================================================================
-- 4. Subtarefas
-- Uma tarefa pode ter filhas. Elas nao aparecem na lista principal:
-- vivem dentro da tarefa mae.
-- ================================================================
alter table tasks add column if not exists parent_id uuid references tasks(id) on delete cascade;
create index if not exists tasks_parent_idx on tasks(parent_id);

-- Evita que uma tarefa vire filha dela mesma
create or replace function valida_subtarefa() returns trigger language plpgsql as $sub$
begin
  if new.parent_id is not null and new.parent_id = new.id then
    raise exception 'Uma tarefa nao pode ser subtarefa dela mesma';
  end if;
  return new;
end;
$sub$;

drop trigger if exists tasks_valida_subtarefa on tasks;
create trigger tasks_valida_subtarefa before insert or update of parent_id on tasks
  for each row execute function valida_subtarefa();

select
  (select count(*) from task_clients) as vinculos_de_cliente,
  (select count(*) from tasks where repeat_rule is not null) as tarefas_repetidas,
  (select count(*) from tasks where parent_id is not null) as subtarefas;
