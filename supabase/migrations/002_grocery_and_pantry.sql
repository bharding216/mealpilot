-- MealPilot — Phase 3: Grocery Lists + Pantry
-- Run this in Supabase SQL Editor after 001_initial_schema.sql

-- ─── Grocery Lists ───
create table if not exists grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table grocery_lists enable row level security;

create policy "Users can read own grocery lists"
  on grocery_lists for select
  using (auth.uid() = user_id);

create policy "Service role can insert grocery lists"
  on grocery_lists for insert
  with check (true);

create policy "Service role can update grocery lists"
  on grocery_lists for update
  using (true);


-- ─── Grocery Items ───
create table if not exists grocery_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references grocery_lists(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  category text not null default 'other',
  in_pantry boolean not null default false,
  checked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table grocery_items enable row level security;

create policy "Users can read own grocery items"
  on grocery_items for select
  using (
    exists (
      select 1 from grocery_lists
      where grocery_lists.id = grocery_items.grocery_list_id
        and grocery_lists.user_id = auth.uid()
    )
  );

create policy "Service role can insert grocery items"
  on grocery_items for insert
  with check (true);

create policy "Service role can update grocery items"
  on grocery_items for update
  using (true);

create policy "Service role can delete grocery items"
  on grocery_items for delete
  using (true);


-- ─── Pantry Items ───
create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  created_at timestamptz not null default now()
);

alter table pantry_items enable row level security;

create policy "Users can read own pantry items"
  on pantry_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own pantry items"
  on pantry_items for insert
  with check (auth.uid() = user_id);

create policy "Service role can insert pantry items"
  on pantry_items for insert
  with check (true);

create policy "Users can delete own pantry items"
  on pantry_items for delete
  using (auth.uid() = user_id);

create policy "Service role can delete pantry items"
  on pantry_items for delete
  using (true);


-- ─── Indexes ───
create index if not exists idx_grocery_lists_user_id on grocery_lists(user_id);
create index if not exists idx_grocery_lists_meal_plan_id on grocery_lists(meal_plan_id);
create index if not exists idx_grocery_items_list_id on grocery_items(grocery_list_id);
create index if not exists idx_pantry_items_user_id on pantry_items(user_id);

-- ─── Updated-at trigger ───
create trigger grocery_lists_updated_at
  before update on grocery_lists
  for each row execute function update_updated_at();
