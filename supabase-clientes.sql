-- ================================================================
-- inProR Painel -- Cadastro dos clientes reais
-- Cole no Supabase Dashboard > SQL Editor e rode.
-- Seguro para rodar mais de uma vez (on conflict do nothing).
-- ================================================================

insert into clients (id, name, active, cuisine_type, delivery_platforms, modules, notes)
values
  ('3a7b1c00-0001-4a00-8a00-000000000001',
   'Estacao Granada Matriz', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   'Unidade matriz'),

  ('3a7b1c00-0001-4a00-8a00-000000000002',
   'Estacao Granada Aricanduva', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000003',
   'Estacao Granada Itaquera', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000004',
   'Estacao Granada Tatuape', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000005',
   'Estacao Coxinha', true, 'salgados',
   array['ifood','rappi'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000006',
   'SimBurger Artesanal', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000007',
   'Sim Smash Burgers', true, 'hamburgueria',
   array['ifood','rappi','ubereats'],
   array['delivery','reputacao','trafego-pago','social','cardapio'],
   null),

  ('3a7b1c00-0001-4a00-8a00-000000000008',
   'RD Solucoes Tecnologicas', true, null,
   null,
   array['trafego-pago','social','cardapio'],
   'Cliente fora do nicho gastronomico: sem modulos de delivery e reputacao')
on conflict (id) do nothing;

-- Conferencia
select name, cuisine_type, modules from clients order by name;

-- ================================================================
-- OPCIONAL: remover o cliente de demonstracao criado no seed.
-- ATENCAO: apaga em cascata os dados de exemplo de reputacao,
-- os 2 projetos demo e as tarefas demo vinculadas a ele.
-- Descomente as duas linhas abaixo apenas se quiser limpar.
-- ================================================================
-- delete from clients where id = '11111111-1111-1111-1111-111111111111';
-- select 'demo removido' as resultado;
