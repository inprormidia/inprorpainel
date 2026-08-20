-- ================================================================
-- inProR Painel -- Relatorio ganha data, departamento e tags
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Requer supabase-relatorios.sql aplicado antes.
-- Seguro para rodar mais de uma vez.
-- ================================================================

-- Data de referencia: permite relatorio semanal ou pontual,
-- nao apenas o fechamento do mes.
alter table reports add column if not exists reference_date date;

-- Departamento responsavel, mesmo cadastro usado nas tarefas
alter table reports add column if not exists department_id uuid
  references departments(id) on delete set null;

-- Etiquetas livres, para agrupar por assunto
alter table reports add column if not exists tags text[] not null default '{}';

create index if not exists reports_department_idx on reports(department_id);
create index if not exists reports_reference_date_idx on reports(reference_date);
-- indice de conjunto: acelera o filtro por etiqueta
create index if not exists reports_tags_idx on reports using gin(tags);

-- Preenche a data dos relatorios que ja existem, a partir do periodo
update reports
set reference_date = to_date(period || '-01', 'YYYY-MM-DD')
where reference_date is null
  and period ~ '^\d{4}-\d{2}$';

update reports
set reference_date = created_at::date
where reference_date is null;

-- Mantem o periodo coerente com a data, para o agrupamento por mes
-- continuar certo sem exigir preenchimento duplo.
create or replace function sincroniza_periodo() returns trigger language plpgsql as $sinc$
begin
  if new.reference_date is not null then
    new.period = to_char(new.reference_date, 'YYYY-MM');
  end if;
  return new;
end;
$sinc$;

drop trigger if exists reports_sincroniza_periodo on reports;
create trigger reports_sincroniza_periodo before insert or update of reference_date on reports
  for each row execute function sincroniza_periodo();

-- Etiquetas ja usadas, para sugerir na hora de escrever
create or replace view report_tags_usadas as
select distinct unnest(tags) as tag from reports where cardinality(tags) > 0;

grant select on report_tags_usadas to authenticated;

select
  (select count(*) from reports) as relatorios,
  (select count(*) from reports where department_id is not null) as com_departamento,
  (select count(*) from reports where cardinality(tags) > 0) as com_etiqueta;
