-- ================================================================
-- inProR Painel -- Correcao de seguranca no armazenamento
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Seguro para rodar mais de uma vez.
--
-- PROBLEMA CORRIGIDO
-- A politica anterior liberava a leitura de qualquer arquivo do
-- bucket para qualquer pessoa autenticada:
--     using (bucket_id = 'anexos')
-- Na pratica, um cliente logado conseguia baixar anexos de tarefas
-- e imagens de relatorios de outros clientes, contornando as regras
-- que protegem as tabelas.
--
-- Agora o acesso ao arquivo segue o acesso ao registro que o cita:
-- quem enxerga a tarefa enxerga os anexos dela, e quem enxerga o
-- relatorio enxerga as imagens dele.
-- ================================================================

-- ── Leitura amarrada ao registro correspondente ──────────────
drop policy if exists "anexos_leitura" on storage.objects;
create policy "anexos_leitura" on storage.objects for select to authenticated
using (
  bucket_id = 'anexos'
  and (
    is_admin()
    -- anexo de tarefa: vale a mesma regra da tarefa
    or exists (
      select 1
      from task_attachments ta
      join tasks t on t.id = ta.task_id
      where ta.storage_path = storage.objects.name
        and (can_see_task(t.id, t.client_id) or is_my_task(t.id))
    )
    -- imagem de relatorio: vale a mesma regra do relatorio
    or exists (
      select 1
      from report_files rf
      join reports r on r.id = rf.report_id
      where rf.storage_path = storage.objects.name
        and can_see_client(r.client_id)
        and (r.publicado or is_agency())
    )
    -- arquivo recem enviado, ainda sem registro: so quem enviou
    or owner = auth.uid()
  )
);

-- ── Envio restrito a quem trabalha na agencia ────────────────
-- Cliente nao precisa subir arquivo, e liberar isso permitiria
-- encher o armazenamento sem controle.
drop policy if exists "anexos_envio" on storage.objects;
create policy "anexos_envio" on storage.objects for insert to authenticated
with check (
  bucket_id = 'anexos'
  and owner = auth.uid()
  and (is_admin() or is_agency())
);

-- ── Remocao: quem enviou ou o administrador ──────────────────
drop policy if exists "anexos_remocao" on storage.objects;
create policy "anexos_remocao" on storage.objects for delete to authenticated
using (
  bucket_id = 'anexos'
  and (owner = auth.uid() or is_admin())
);

-- ── Atualizacao de arquivo: mesma regra do envio ─────────────
drop policy if exists "anexos_atualizacao" on storage.objects;
create policy "anexos_atualizacao" on storage.objects for update to authenticated
using (bucket_id = 'anexos' and (owner = auth.uid() or is_admin()))
with check (bucket_id = 'anexos' and (owner = auth.uid() or is_admin()));

-- ── Garante que o bucket segue privado ───────────────────────
update storage.buckets set public = false where id = 'anexos';

-- ── Conferencia ──────────────────────────────────────────────
select
  (select public from storage.buckets where id = 'anexos') as bucket_publico,
  (select count(*) from storage.objects where bucket_id = 'anexos') as arquivos,
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'anexos_%') as politicas;
