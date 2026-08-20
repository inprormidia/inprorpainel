-- ================================================================
-- inProR Painel -- Relatorios com texto e imagens
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer os SQLs anteriores aplicados.
-- Seguro para rodar mais de uma vez.
--
-- Ate agora um relatorio era so um titulo e um link externo.
-- Passa a guardar o documento inteiro: texto formatado e imagens.
-- ================================================================

-- Corpo do relatorio, no mesmo formato do passo a passo das tarefas
alter table reports add column if not exists content text;
alter table reports add column if not exists updated_at timestamptz default now();
alter table reports add column if not exists author_id uuid references auth.users(id) on delete set null;
-- rascunho nao aparece para o cliente
alter table reports add column if not exists publicado boolean not null default true;

drop trigger if exists reports_updated_at on reports;
create trigger reports_updated_at before update on reports
  for each row execute function set_updated_at();

create index if not exists reports_client_idx on reports(client_id, period);

-- ── Imagens e arquivos do relatorio ──────────────────────────
create table if not exists report_files (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references reports(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  name         text not null,
  storage_path text not null,
  mime         text,
  size_bytes   bigint,
  created_at   timestamptz default now()
);
create index if not exists report_files_report_idx on report_files(report_id, created_at);

alter table report_files enable row level security;

drop policy if exists "read_report_files" on report_files;
create policy "read_report_files" on report_files for select to authenticated
  using (exists (
    select 1 from reports r where r.id = report_files.report_id
      and can_see_client(r.client_id)
  ));

drop policy if exists "write_report_files" on report_files;
create policy "write_report_files" on report_files for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from reports r where r.id = report_files.report_id
        and (is_admin() or (is_agency() and can_see_client(r.client_id)))
    )
  );

drop policy if exists "delete_report_files" on report_files;
create policy "delete_report_files" on report_files for delete to authenticated
  using (author_id = auth.uid() or is_admin());

-- ── Rascunho fica invisivel para o cliente ───────────────────
drop policy if exists "scoped_read_reports" on reports;
create policy "scoped_read_reports" on reports for select to authenticated
  using (
    can_see_client(client_id)
    and (publicado or is_admin() or is_agency())
  );

-- ── Armazenamento ────────────────────────────────────────────
-- Mesmo bucket privado dos anexos de tarefa: as imagens do
-- relatorio ficam em relatorios/<id do relatorio>/arquivo
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 26214400)
on conflict (id) do nothing;

select
  (select count(*) from reports) as relatorios,
  (select count(*) from reports where content is not null) as com_conteudo;
