create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null default '친구의 생일 위시',
  occasion text not null default 'birthday',
  product jsonb not null,
  self_amount integer not null default 0 check (self_amount >= 0),
  list_price integer not null check (list_price > 0),
  current_price integer not null check (current_price > 0),
  seller_subsidy integer not null default 0 check (seller_subsidy >= 0),
  seller_offer_label text,
  deadline date,
  creator_message text,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null default '친구',
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null default '친구',
  text text not null,
  kind text not null default 'cheer',
  created_at timestamptz not null default now()
);

create index if not exists contributions_room_id_idx on public.contributions(room_id, created_at);
create index if not exists messages_room_id_idx on public.messages(room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.contributions enable row level security;
alter table public.messages enable row level security;

-- 이 MVP는 브라우저가 Supabase에 직접 접근하지 않고 Vercel API를 거칩니다.
-- 따라서 public anon 정책은 만들지 않습니다. SUPABASE_SERVICE_ROLE_KEY는 Vercel 서버 환경변수에만 저장하세요.
