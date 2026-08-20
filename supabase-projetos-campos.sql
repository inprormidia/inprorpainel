-- ================================================================
-- inProR Painel -- Projeto ganha departamento
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- Mesmo cadastro de departamentos usado em tarefas e relatorios
alter table projects add column if not exists department_id uuid
  references departments(id) on delete set null;

create index if not exists projects_department_idx on projects(department_id);

-- Quem nao e administrador nao enxerga orcamento. Como a coluna
-- vive na mesma linha do projeto, a restricao fica na leitura:
-- a equipe consulta esta visao, que simplesmente nao traz o valor.
create or replace view projetos_sem_orcamento as
select
  id, client_id, department_id, name, description, status, priority,
  start_date, due_date, owner, color, created_at, updated_at
from projects;

grant select on projetos_sem_orcamento to authenticated;

select
  (select count(*) from projects) as projetos,
  (select count(*) from projects where department_id is not null) as com_departamento;
