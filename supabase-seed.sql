-- ================================================================
-- inProR Painel -- Seed de dados de teste (rode APOS supabase-setup.sql)
-- Cria 1 restaurante demo e snapshots de reputacao para ver a pagina
-- funcionando. Seguro para rodar mais de uma vez (on conflict).
-- ================================================================

-- Restaurante demo com UUID fixo
insert into clients (id, name, active, cuisine_type, delivery_platforms, modules)
values (
  '11111111-1111-1111-1111-111111111111',
  'Estacao Granada (demo)',
  true,
  'hamburgueria',
  array['ifood','rappi','ubereats'],
  array['delivery','reputacao','trafego-pago','social']
)
on conflict (id) do nothing;

-- Snapshots de reputacao: 4 meses, 3 fontes.
-- Google sobe, iFood cai no ultimo mes (dispara alerta), Rappi estavel.
insert into reputation_metrics
  (client_id, source, date, rating, total_reviews, new_reviews, positive, negative, response_rate)
values
  -- Google
  ('11111111-1111-1111-1111-111111111111','google','2026-04-01', 4.50, 820,  18, 700,  60, 72.0),
  ('11111111-1111-1111-1111-111111111111','google','2026-05-01', 4.55, 848,  28, 728,  58, 78.0),
  ('11111111-1111-1111-1111-111111111111','google','2026-06-01', 4.60, 879,  31, 760,  55, 83.0),
  ('11111111-1111-1111-1111-111111111111','google','2026-07-01', 4.63, 905,  26, 788,  52, 88.0),
  -- iFood (queda no ultimo mes)
  ('11111111-1111-1111-1111-111111111111','ifood','2026-04-01', 4.70, 1240, 40, 1120, 70, 95.0),
  ('11111111-1111-1111-1111-111111111111','ifood','2026-05-01', 4.72, 1310, 70, 1190, 72, 96.0),
  ('11111111-1111-1111-1111-111111111111','ifood','2026-06-01', 4.71, 1388, 78, 1255, 80, 94.0),
  ('11111111-1111-1111-1111-111111111111','ifood','2026-07-01', 4.55, 1460, 72, 1300, 118, 90.0),
  -- Rappi (estavel)
  ('11111111-1111-1111-1111-111111111111','rappi','2026-04-01', 4.40, 410,  12, 340,  50, 60.0),
  ('11111111-1111-1111-1111-111111111111','rappi','2026-05-01', 4.42, 430,  20, 358,  48, 63.0),
  ('11111111-1111-1111-1111-111111111111','rappi','2026-06-01', 4.41, 452,  22, 376,  50, 65.0),
  ('11111111-1111-1111-1111-111111111111','rappi','2026-07-01', 4.43, 475,  23, 397,  49, 68.0);

-- ================================================================
-- Para o usuario admin ver estes dados:
-- 1. Crie seu usuario em Authentication > Users (Add user)
-- 2. Copie o UUID do usuario e rode:
--    insert into user_roles (user_id, role) values ('<SEU-UUID-AUTH>', 'admin');
-- ================================================================
