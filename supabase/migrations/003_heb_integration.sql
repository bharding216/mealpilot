-- MealPilot — H-E-B Integration Schema
-- Run this in Supabase SQL Editor

-- ─── H-E-B Sessions ───
-- Stores the user's HEB session cookies (server-side only, never sent to mobile)
create table if not exists heb_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  cookies text not null,
  store_id text,
  store_name text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table heb_sessions enable row level security;

create policy "Service role manages HEB sessions"
  on heb_sessions for all
  using (true)
  with check (true);


-- ─── Product Matches ───
-- Caches the mapping between a grocery item and the selected HEB product
create table if not exists product_matches (
  id uuid primary key default gen_random_uuid(),
  grocery_item_id uuid not null references grocery_items(id) on delete cascade,
  product_id text not null,
  sku_id text not null,
  product_name text not null,
  brand text,
  size text,
  price numeric,
  unit_price text,
  image_url text,
  product_url text,
  in_stock boolean not null default true,
  category text,
  status text not null default 'matched' check (status in ('matched', 'confirmed', 'rejected', 'in_cart')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table product_matches enable row level security;

create policy "Service role manages product matches"
  on product_matches for all
  using (true)
  with check (true);


-- ─── Indexes ───
create index if not exists idx_heb_sessions_user_id on heb_sessions(user_id);
create index if not exists idx_product_matches_grocery_item on product_matches(grocery_item_id);
create index if not exists idx_product_matches_status on product_matches(status);

-- ─── Updated-at triggers ───
create trigger heb_sessions_updated_at
  before update on heb_sessions
  for each row execute function update_updated_at();

create trigger product_matches_updated_at
  before update on product_matches
  for each row execute function update_updated_at();
