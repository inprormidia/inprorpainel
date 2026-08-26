-- ================================================================
-- inProR Painel -- Base de datas comemorativas
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Seguro para rodar mais de uma vez.
--
-- POR QUE ESTA TABELA EXISTE
-- Levantar as datas do mes era refeito do zero toda vez, com
-- resultado diferente a cada pessoa. Aqui a data e cadastrada uma
-- vez e volta sozinha todo ano, para todos os clientes do mesmo
-- segmento. A tarefa mensal deixa de ser pesquisar e passa a ser
-- escolher.
--
-- Nao e agenda. Compromisso com hora marcada e reuniao, tarefa ou
-- relatorio, cada um na sua tabela. Aqui fica so o que se repete.
-- ================================================================

create table if not exists commemorative_dates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,

  mes         smallint not null check (mes between 1 and 12),

  -- Data de dia fixo: 28 de maio todo ano.
  dia         smallint check (dia between 1 and 31),

  -- Data que anda de lugar: Dia das Maes e o segundo domingo de
  -- maio. Guardamos a regra, nao o dia, senao a base envelhece e
  -- alguem tem que corrigir no virar do ano.
  --   regra_ordinal:    1 a 5 conta do inicio, -1 conta do fim
  --   regra_dia_semana: 0 domingo ... 6 sabado
  regra_ordinal    smallint check (regra_ordinal between -1 and 5 and regra_ordinal <> 0),
  regra_dia_semana smallint check (regra_dia_semana between 0 and 6),

  -- Preenchido so quando a data vale para um ano so, como Carnaval,
  -- que depende da Pascoa e nao cabe nas regras acima.
  ano         smallint check (ano between 2020 and 2100),

  -- Para quem a data serve. 'geral' aparece para todo mundo.
  segmentos   text[] not null default '{geral}',

  relevancia  text not null default 'media'
                check (relevancia in ('alta', 'media', 'baixa')),

  -- Como a marca costuma usar a data, e o que deu certo antes.
  -- E aqui que a base fica melhor a cada ano.
  observacao  text,

  -- Data que precisa de oferta e arte prontas antes, nao no dia.
  antecedencia_dias smallint check (antecedencia_dias between 0 and 90),

  ativo       boolean not null default true,
  created_at  timestamptz default now(),

  -- Ou tem dia fixo, ou tem regra completa. Nunca os dois, nunca
  -- nenhum: sem isso a data nao consegue cair no calendario.
  constraint data_definida check (
    (dia is not null and regra_ordinal is null and regra_dia_semana is null)
    or
    (dia is null and regra_ordinal is not null and regra_dia_semana is not null)
  )
);

create index if not exists commemorative_mes_idx
  on commemorative_dates(mes) where ativo;

-- Mesma data nao entra duas vezes
create unique index if not exists commemorative_sem_repeticao
  on commemorative_dates(lower(name), mes, coalesce(ano, 0));

-- ── Quem enxerga ─────────────────────────────────────────────
-- Base de trabalho da agencia: a equipe consulta e mantem, o
-- cliente nao precisa ver o material bruto do planejamento.
alter table commemorative_dates enable row level security;

drop policy if exists "read_commemorative" on commemorative_dates;
create policy "read_commemorative" on commemorative_dates for select to authenticated
  using (is_admin() or is_agency());

drop policy if exists "write_commemorative" on commemorative_dates;
create policy "write_commemorative" on commemorative_dates for insert to authenticated
  with check (is_admin() or is_agency());

drop policy if exists "update_commemorative" on commemorative_dates;
create policy "update_commemorative" on commemorative_dates for update to authenticated
  using (is_admin() or is_agency()) with check (is_admin() or is_agency());

drop policy if exists "delete_commemorative" on commemorative_dates;
create policy "delete_commemorative" on commemorative_dates for delete to authenticated
  using (is_admin());

-- ================================================================
-- CARGA INICIAL
--
-- ATENCAO, LEIA ANTES DE CONFIAR NA LISTA
-- As datas civis e os feriados abaixo sao firmes. Ja as datas
-- gastronomicas mudam de fonte para fonte: boa parte foi criada por
-- associacao comercial e nao tem data unica reconhecida. Elas entram
-- aqui como ponto de partida, com aviso na observacao, e precisam de
-- uma conferida antes do primeiro uso.
--
-- Conferiu? Apague o aviso da observacao e escreva no lugar como a
-- marca usa a data. E esse texto que faz a base valer alguma coisa.
-- ================================================================

insert into commemorative_dates
  (name, dia, mes, regra_ordinal, regra_dia_semana, segmentos, relevancia, antecedencia_dias, observacao)
values
  -- ── Datas civis de dia fixo ────────────────────────────────
  ('Ano Novo',                  1,  1, null, null, '{geral}',   'media', 7,  null),
  ('Dia do Trabalho',           1,  5, null, null, '{geral}',   'baixa', 3,  'Feriado. Vale mais como aviso de horario de funcionamento do que como campanha.'),
  ('Dia dos Namorados',        12,  6, null, null, '{geral}',   'alta',  21, 'Data de combo para dois e de pedido no fim da noite. Alinhar operacao antes.'),
  ('Independencia',             7,  9, null, null, '{geral}',   'baixa', 3,  'Feriado. Checar horario das unidades.'),
  ('Dia do Cliente',           15,  9, null, null, '{geral}',   'media', 14, 'Data de agradecimento e de oferta para base ja cadastrada.'),
  ('Halloween',                31, 10, null, null, '{geral}',   'baixa', 14, 'Cabe em marca de linguagem jovem. Conferir se combina com o cliente.'),
  ('Natal',                    25, 12, null, null, '{geral}',   'media', 21, 'Feriado. Horario de funcionamento e o conteudo mais util do dia.'),
  ('Vespera de Ano Novo',      31, 12, null, null, '{geral}',   'media', 14, null),

  -- ── Datas que andam de lugar ───────────────────────────────
  ('Dia das Maes',           null,  5,  2, 0, '{geral}', 'alta',  21, 'Segundo domingo de maio. Pico de delivery no almoco. Operacao precisa saber antes.'),
  ('Dia dos Pais',           null,  8,  2, 0, '{geral}', 'alta',  21, 'Segundo domingo de agosto. Mesma logica do Dia das Maes.'),
  ('Black Friday',           null, 11, -1, 5, '{geral}', 'alta',  30, 'Ultima sexta de novembro. Oferta precisa estar fechada com bastante antecedencia.'),

  -- ── Datas gastronomicas, conferir antes de usar ────────────
  ('Dia Mundial do Hamburguer', 28,  5, null, null, '{hamburgueria}', 'alta',  14, 'CONFERIR A DATA ANTES DE USAR. A mais consolidada do setor, boa para hamburgueria.'),
  ('Dia da Pizza',              10,  7, null, null, '{geral}',        'baixa', 7,  'CONFERIR A DATA ANTES DE USAR. So usar se o cliente vende pizza.'),
  ('Dia do Sorvete',            23,  9, null, null, '{geral}',        'baixa', 7,  'CONFERIR A DATA ANTES DE USAR. Serve para sobremesa e combo de verao.'),
  ('Dia do Cafe',               14,  4, null, null, '{geral}',        'baixa', 7,  'CONFERIR A DATA ANTES DE USAR. Ha versao internacional em outubro.')
on conflict do nothing;

-- ── Liberar o modulo para a equipe ───────────────────────────
-- Sem isto so o administrador enxerga o calendario: quem e da equipe
-- tem os modulos gravados no proprio cadastro, e este ainda nao
-- existia quando eles foram cadastrados.
alter table team_members alter column modules set default
  array['tarefas','projetos','delivery','reputacao','trafego-pago',
        'social','cardapio','relatorios','reunioes','calendario',
        'estrategias','metas-kpis'];

update team_members
set modules = modules || array['calendario']
where modules is not null
  and not (modules @> array['calendario']);

-- ── Conferencia ──────────────────────────────────────────────
select
  (select count(*) from commemorative_dates) as datas_cadastradas,
  (select count(*) from commemorative_dates where dia is null) as datas_moveis,
  (select count(*) from commemorative_dates where observacao like 'CONFERIR%') as a_conferir,
  (select count(*) from team_members where modules @> array['calendario']) as equipe_com_acesso;
