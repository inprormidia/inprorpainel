-- ================================================================
-- inProR Painel -- Remove os dados de demonstracao
-- Cole no Supabase Dashboard > SQL Editor e rode.
--
-- ATENCAO: isto apaga de verdade. Sao os dados que criei no comeco
-- para o painel nao ficar vazio enquanto era construido:
--   - o cliente "Estacao Granada (demo)"
--   - os 2 projetos de exemplo ligados a ele
--   - as tarefas de exemplo desses projetos
--   - os snapshots de reputacao de exemplo
--
-- Nada seu e afetado: os clientes reais, as 31 tarefas e o projeto
-- "Historia e Institucionalizacao da marca" permanecem.
--
-- Rode primeiro o bloco de conferencia para ver o que sai.
-- ================================================================

-- ── 1. Conferencia: o que sera removido ──────────────────────
select 'cliente' as tipo, name as item
from clients where id = '11111111-1111-1111-1111-111111111111'
union all
select 'projeto', name
from projects where client_id = '11111111-1111-1111-1111-111111111111'
union all
select 'tarefa', title
from tasks where client_id = '11111111-1111-1111-1111-111111111111'
union all
select 'reputacao', source || ' em ' || date::text
from reputation_metrics where client_id = '11111111-1111-1111-1111-111111111111';

-- ── 2. Remocao ───────────────────────────────────────────────
-- As tabelas filhas caem junto pelo vinculo em cascata:
-- projetos, tarefas, responsaveis, comentarios, anexos e reputacao.
delete from clients where id = '11111111-1111-1111-1111-111111111111';

-- ── 3. Projetos de exemplo que tenham sobrado sem cliente ────
delete from projects
where id in (
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222'
);

-- ── 4. Conferencia final ─────────────────────────────────────
select
  (select count(*) from clients)  as clientes,
  (select count(*) from projects) as projetos,
  (select count(*) from tasks)    as tarefas,
  (select count(*) from reputation_metrics) as registros_reputacao;
