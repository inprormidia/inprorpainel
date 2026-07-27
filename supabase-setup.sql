-- ================================================================
-- inProR Painel -- Schema inicial
-- Cole este SQL no Supabase Dashboard > SQL Editor
-- ================================================================

-- ── Extensoes ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Helper: updated_at trigger ────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── clients ──────────────────────────────────────────────────
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  active          boolean not null default true,
  email           text,
  phone           text,
  cuisine_type    text,
  delivery_platforms text[],
  delivery_radius int,
  modules         text[] default '{}',
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- ── user_roles ────────────────────────────────────────────────
create table if not exists user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid references clients(id) on delete set null,
  role       text not null check (role in ('admin','client')) default 'client',
  created_at timestamptz default now(),
  unique(user_id)
);

-- ── ads_metrics ───────────────────────────────────────────────
create table if not exists ads_metrics (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  platform    text not null check (platform in ('meta','google_ads','tiktok','outros')),
  date        date not null,
  month       text generated always as (extract(year from date)::text || '-' || lpad(extract(month from date)::text, 2, '0')) stored,
  impressions bigint default 0,
  clicks      bigint default 0,
  conversions int    default 0,
  spend       numeric(12,2) default 0,
  cpl         numeric(10,2) default 0,
  ctr         numeric(6,4)  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger ads_metrics_updated_at before update on ads_metrics
  for each row execute function set_updated_at();

-- ── delivery_metrics ─────────────────────────────────────────
create table if not exists delivery_metrics (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  platform           text not null check (platform in ('ifood','rappi','ubereats','aiqfome','outros')),
  date               date not null,
  month              text generated always as (extract(year from date)::text || '-' || lpad(extract(month from date)::text, 2, '0')) stored,
  orders             int     default 0,
  avg_ticket         numeric(10,2) default 0,
  gmv                numeric(12,2) default 0,
  cancellation_rate  numeric(5,2),
  avg_delivery_time  int,
  rating             numeric(3,2),
  impressions        int,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create trigger delivery_metrics_updated_at before update on delivery_metrics
  for each row execute function set_updated_at();

-- ── reputation_metrics ───────────────────────────────────────
create table if not exists reputation_metrics (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  source         text not null check (source in ('google','ifood','rappi','ubereats','tripadvisor','outros')),
  rating         numeric(3,2),
  total_reviews  int default 0,
  new_reviews    int default 0,
  positive       int default 0,
  negative       int default 0,
  response_rate  numeric(5,2),
  date           date not null,
  created_at     timestamptz default now()
);

-- ── articles (social + cardapio) ─────────────────────────────
create table if not exists articles (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  title              text,
  tipo               text not null check (tipo in ('Reels','Feed','Stories','Carrossel','TikTok','UGC','Pagina','Blog')),
  status             text not null default 'rascunho' check (status in ('rascunho','revisao','aprovado','publicado')),
  plataforma         text,
  produto_destacado  text,
  url                text,
  published_at       date,
  notes              text,
  notion_id          text unique,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create trigger articles_updated_at before update on articles
  for each row execute function set_updated_at();

-- ── meetings ─────────────────────────────────────────────────
create table if not exists meetings (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  title       text not null,
  date        date,
  notes       text,
  notion_id   text unique,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger meetings_updated_at before update on meetings
  for each row execute function set_updated_at();

-- ── reports ──────────────────────────────────────────────────
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  title       text not null,
  period      text,
  url         text,
  created_at  timestamptz default now()
);

-- ── faturas ──────────────────────────────────────────────────
create table if not exists faturas (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id) on delete cascade,
  amount       numeric(12,2) not null,
  due_date     date,
  paid_at      date,
  status       text default 'pendente' check (status in ('pendente','pago','vencido','cancelado')),
  description  text,
  created_at   timestamptz default now()
);

-- ── tasks ────────────────────────────────────────────────────
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete set null,
  title       text not null,
  description text,
  status      text not null default 'backlog' check (status in ('backlog','em_andamento','aguardando','concluida')),
  priority    text default 'media' check (priority in ('baixa','media','alta','urgente')),
  due_date    date,
  assigned_to text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ── client_briefing ──────────────────────────────────────────
create table if not exists client_briefing (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null,
  content     text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger client_briefing_updated_at before update on client_briefing
  for each row execute function set_updated_at();

-- ── client_goals ─────────────────────────────────────────────
create table if not exists client_goals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null,
  description text,
  target      text,
  deadline    date,
  status      text default 'em_andamento',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger client_goals_updated_at before update on client_goals
  for each row execute function set_updated_at();

-- ── client_kpis ──────────────────────────────────────────────
create table if not exists client_kpis (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  unit        text,
  target      numeric,
  current     numeric,
  period      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger client_kpis_updated_at before update on client_kpis
  for each row execute function set_updated_at();

-- ── RLS: habilitar em todas as tabelas ───────────────────────
alter table clients           enable row level security;
alter table user_roles        enable row level security;
alter table ads_metrics       enable row level security;
alter table delivery_metrics  enable row level security;
alter table reputation_metrics enable row level security;
alter table articles          enable row level security;
alter table meetings          enable row level security;
alter table reports           enable row level security;
alter table faturas           enable row level security;
alter table tasks             enable row level security;
alter table client_briefing   enable row level security;
alter table client_goals      enable row level security;
alter table client_kpis       enable row level security;

-- ── RLS: Policies admin (acesso total para usuarios com role=admin) ──
-- helpers
create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
$$;

create or replace function my_client_id() returns uuid language sql stable as $$
  select client_id from user_roles where user_id = auth.uid() and role = 'client' limit 1
$$;

-- clients
create policy "admin_all_clients" on clients for all to authenticated using (is_admin());
create policy "client_own_client" on clients for select to authenticated
  using (id = my_client_id());

-- user_roles
create policy "admin_all_user_roles" on user_roles for all to authenticated using (is_admin());
create policy "user_own_role" on user_roles for select to authenticated
  using (user_id = auth.uid());

-- ads_metrics
create policy "admin_all_ads" on ads_metrics for all to authenticated using (is_admin());
create policy "client_own_ads" on ads_metrics for select to authenticated
  using (client_id = my_client_id());

-- delivery_metrics
create policy "admin_all_delivery" on delivery_metrics for all to authenticated using (is_admin());
create policy "client_own_delivery" on delivery_metrics for select to authenticated
  using (client_id = my_client_id());

-- reputation_metrics
create policy "admin_all_reputation" on reputation_metrics for all to authenticated using (is_admin());
create policy "client_own_reputation" on reputation_metrics for select to authenticated
  using (client_id = my_client_id());

-- articles
create policy "admin_all_articles" on articles for all to authenticated using (is_admin());
create policy "client_own_articles" on articles for select to authenticated
  using (client_id = my_client_id());

-- meetings
create policy "admin_all_meetings" on meetings for all to authenticated using (is_admin());
create policy "client_own_meetings" on meetings for select to authenticated
  using (client_id = my_client_id());

-- reports
create policy "admin_all_reports" on reports for all to authenticated using (is_admin());
create policy "client_own_reports" on reports for select to authenticated
  using (client_id = my_client_id());

-- faturas
create policy "admin_all_faturas" on faturas for all to authenticated using (is_admin());
create policy "client_own_faturas" on faturas for select to authenticated
  using (client_id = my_client_id());

-- tasks
create policy "admin_all_tasks" on tasks for all to authenticated using (is_admin());
create policy "client_own_tasks" on tasks for select to authenticated
  using (client_id = my_client_id());

-- client_briefing
create policy "admin_all_briefing" on client_briefing for all to authenticated using (is_admin());
create policy "client_own_briefing" on client_briefing for select to authenticated
  using (client_id = my_client_id());

-- client_goals
create policy "admin_all_goals" on client_goals for all to authenticated using (is_admin());
create policy "client_own_goals" on client_goals for select to authenticated
  using (client_id = my_client_id());

-- client_kpis
create policy "admin_all_kpis" on client_kpis for all to authenticated using (is_admin());
create policy "client_own_kpis" on client_kpis for select to authenticated
  using (client_id = my_client_id());

-- ================================================================
-- Apos criar o usuario admin no Supabase Auth, rode:
-- insert into user_roles (user_id, role) values ('<SEU-UUID-AUTH>', 'admin');
-- ================================================================
