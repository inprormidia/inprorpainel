-- ================================================================
-- inProR Painel -- Departamentos, comentarios e anexos
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer os SQLs anteriores aplicados.
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- ================================================================
-- 1. Departamentos
-- Baseado no organograma da agencia. Fica em tabela, e nao fixo no
-- codigo, para voce ajustar sem depender de nova versao do painel.
-- ================================================================
create table if not exists departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#64748b',
  ordem      int  not null default 100,
  active     boolean not null default true,
  created_at timestamptz default now()
);

alter table departments enable row level security;

drop policy if exists "read_departments" on departments;
create policy "read_departments" on departments for select to authenticated using (true);

drop policy if exists "admin_write_departments" on departments;
create policy "admin_write_departments" on departments for all to authenticated
  using (is_admin()) with check (is_admin());

insert into departments (name, color, ordem) values
  ('Trafego Pago',            '#A85730', 10),
  ('Conteudo e Social Media', '#0C2118', 20),
  ('Design',                  '#7c3aed', 30),
  ('Video',                   '#be185d', 40),
  ('Fotografia',              '#0891b2', 50),
  ('Copywriting',             '#b45309', 60),
  ('SEO',                     '#15803d', 70),
  ('Delivery',                '#EA1D2C', 80),
  ('Comercial',               '#1d4ed8', 90),
  ('Sucesso do Cliente',      '#0f766e', 100),
  ('Tecnologia e Automacao',  '#475569', 110),
  ('Financeiro',              '#065f46', 120),
  ('Pessoas',                 '#9333ea', 130)
on conflict (name) do nothing;

alter table tasks add column if not exists department_id uuid
  references departments(id) on delete set null;
create index if not exists tasks_department_id_idx on tasks(department_id);

-- ── Momento da conclusao: permite sumir com as concluidas antigas ──
alter table tasks add column if not exists completed_at timestamptz;

update tasks set completed_at = coalesce(updated_at, created_at)
where status = 'concluida' and completed_at is null;

-- Mantem completed_at coerente com a etapa, sem depender do frontend
create or replace function marca_conclusao() returns trigger language plpgsql as $funcao$
begin
  if new.status = 'concluida' and coalesce(old.status, '') <> 'concluida' then
    new.completed_at = now();
  elsif new.status <> 'concluida' then
    new.completed_at = null;
  end if;
  return new;
end;
$funcao$;

drop trigger if exists tasks_marca_conclusao on tasks;
create trigger tasks_marca_conclusao before insert or update of status on tasks
  for each row execute function marca_conclusao();

-- ================================================================
-- 2. Comentarios da tarefa
-- ================================================================
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  member_id  uuid references team_members(id) on delete set null,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists task_comments_task_idx on task_comments(task_id, created_at);

drop trigger if exists task_comments_updated_at on task_comments;
create trigger task_comments_updated_at before update on task_comments
  for each row execute function set_updated_at();

alter table task_comments enable row level security;

-- Le quem enxerga a tarefa
drop policy if exists "read_task_comments" on task_comments;
create policy "read_task_comments" on task_comments for select to authenticated
  using (exists (
    select 1 from tasks t where t.id = task_comments.task_id
      and (can_see_client(t.client_id) or is_my_task(t.id))
  ));

-- Escreve quem enxerga a tarefa, sempre em nome proprio
drop policy if exists "write_task_comments" on task_comments;
create policy "write_task_comments" on task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from tasks t where t.id = task_comments.task_id
        and (can_see_client(t.client_id) or is_my_task(t.id))
    )
  );

-- Edita apenas o proprio comentario; admin tambem pode remover
drop policy if exists "manage_own_comments" on task_comments;
create policy "manage_own_comments" on task_comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "delete_own_comments" on task_comments;
create policy "delete_own_comments" on task_comments for delete to authenticated
  using (author_id = auth.uid() or is_admin());

-- ================================================================
-- 3. Anexos: arquivos, documentos e links
-- ================================================================
create table if not exists task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  member_id    uuid references team_members(id) on delete set null,
  author_id    uuid references auth.users(id) on delete set null,
  kind         text not null default 'arquivo' check (kind in ('arquivo','link')),
  name         text not null,
  url          text,
  storage_path text,
  mime         text,
  size_bytes   bigint,
  created_at   timestamptz default now()
);
create index if not exists task_attachments_task_idx on task_attachments(task_id, created_at);

alter table task_attachments enable row level security;

drop policy if exists "read_task_attachments" on task_attachments;
create policy "read_task_attachments" on task_attachments for select to authenticated
  using (exists (
    select 1 from tasks t where t.id = task_attachments.task_id
      and (can_see_client(t.client_id) or is_my_task(t.id))
  ));

drop policy if exists "write_task_attachments" on task_attachments;
create policy "write_task_attachments" on task_attachments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from tasks t where t.id = task_attachments.task_id
        and (can_see_client(t.client_id) or is_my_task(t.id))
    )
  );

drop policy if exists "delete_task_attachments" on task_attachments;
create policy "delete_task_attachments" on task_attachments for delete to authenticated
  using (author_id = auth.uid() or is_admin());

-- ================================================================
-- 4. Armazenamento dos arquivos
-- Bucket privado: o painel gera um link temporario ao abrir o anexo.
-- Limite de 25 MB por arquivo.
-- ================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "anexos_leitura" on storage.objects;
create policy "anexos_leitura" on storage.objects for select to authenticated
  using (bucket_id = 'anexos');

drop policy if exists "anexos_envio" on storage.objects;
create policy "anexos_envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and owner = auth.uid());

drop policy if exists "anexos_remocao" on storage.objects;
create policy "anexos_remocao" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (owner = auth.uid() or is_admin()));

-- ── Conferencia ──────────────────────────────────────────────
select name, color, ordem from departments order by ordem;
