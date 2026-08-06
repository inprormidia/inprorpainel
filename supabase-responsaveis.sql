-- ================================================================
-- inProR Painel -- Varios responsaveis por tarefa
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer supabase-equipe.sql aplicado antes.
-- Seguro para rodar mais de uma vez.
--
-- Resolve dois problemas:
-- 1. Nomes compostos como "Richard, Camili" viraram um membro unico
--    na migracao anterior. Aqui eles sao separados em pessoas reais.
-- 2. Uma tarefa passa a aceitar mais de um responsavel.
-- ================================================================

-- ── Vinculo tarefa <-> responsavel ───────────────────────────
create table if not exists task_assignees (
  task_id    uuid not null references tasks(id) on delete cascade,
  member_id  uuid not null references team_members(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (task_id, member_id)
);

create index if not exists task_assignees_task_idx   on task_assignees(task_id);
create index if not exists task_assignees_member_idx on task_assignees(member_id);

alter table task_assignees enable row level security;

drop policy if exists "admin_all_task_assignees" on task_assignees;
create policy "admin_all_task_assignees" on task_assignees for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "client_read_task_assignees" on task_assignees;
create policy "client_read_task_assignees" on task_assignees for select to authenticated
  using (exists (
    select 1 from tasks t
    where t.id = task_assignees.task_id and t.client_id = my_client_id()
  ));

-- ── Passo 1: traz o responsavel unico atual para a nova tabela ──
insert into task_assignees (task_id, member_id)
select id, assignee_id from tasks
where assignee_id is not null
on conflict do nothing;

-- ── Passo 2: separa membros cujo nome junta varias pessoas ────
-- Ex.: "Richard, Camili" vira os membros "Richard" e "Camili".
-- Aceita virgula, barra, ponto e virgula e a palavra "e" como separador.
do $$
declare
  composto record;
  parte    text;
  destino  uuid;
begin
  for composto in
    select id, name, color from team_members
    where name ~ '[,;/]| e '
  loop
    foreach parte in array regexp_split_to_array(composto.name, '\s*(,|;|/|\s+e\s+)\s*')
    loop
      parte := trim(parte);
      continue when parte = '';

      -- reaproveita o membro se ja existir, senao cria
      select id into destino from team_members
      where lower(name) = lower(parte) limit 1;

      if destino is null then
        insert into team_members (name, color)
        values (parte, composto.color)
        returning id into destino;
      end if;

      -- toda tarefa do membro composto passa a ter esta pessoa
      insert into task_assignees (task_id, member_id)
      select ta.task_id, destino from task_assignees ta
      where ta.member_id = composto.id
      on conflict do nothing;
    end loop;

    -- remove o membro composto (o cascade limpa os vinculos antigos)
    delete from team_members where id = composto.id;
  end loop;
end $$;

-- ── Passo 3: assignee_id deixa de ser a fonte da verdade ─────
-- Mantido apenas como historico. O painel passa a ler task_assignees.
update tasks t
set assignee_id = (
  select ta.member_id from task_assignees ta where ta.task_id = t.id limit 1
)
where exists (select 1 from task_assignees ta where ta.task_id = t.id);

-- ── Conferencia ──────────────────────────────────────────────
select m.name,
       count(ta.task_id) as tarefas
from team_members m
left join task_assignees ta on ta.member_id = m.id
group by m.name
order by m.name;
