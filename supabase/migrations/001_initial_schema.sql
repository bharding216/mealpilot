-- MealPilot — Initial Schema
-- Run this in Supabase SQL Editor or as a migration

-- ─── User Profiles ───
create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  household_size integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "Users can read own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on user_profiles for update
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on user_profiles for insert
  with check (auth.uid() = user_id);


-- ─── User Preferences ───
create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  dietary_restrictions text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  favorite_cuisines text[] not null default '{}',
  grocery_budget numeric,
  cooking_time_preference text check (cooking_time_preference in ('quick', 'moderate', 'any')),
  kid_friendly boolean not null default false,
  leftover_preference text check (leftover_preference in ('yes', 'no', 'sometimes')),
  household_size integer,
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;

create policy "Users can read own preferences"
  on user_preferences for select
  using (auth.uid() = user_id);

create policy "Users can upsert own preferences"
  on user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on user_preferences for update
  using (auth.uid() = user_id);


-- ─── Recipes ───
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  servings integer not null default 4,
  prep_time_minutes integer,
  cook_time_minutes integer,
  instructions text[] not null default '{}',
  ingredients jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;

create policy "Recipes are readable by authenticated users"
  on recipes for select
  using (auth.role() = 'authenticated');

create policy "Service role can insert recipes"
  on recipes for insert
  with check (true);


-- ─── Meal Plans ───
create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meal_plans enable row level security;

create policy "Users can read own meal plans"
  on meal_plans for select
  using (auth.uid() = user_id);

create policy "Service role can insert meal plans"
  on meal_plans for insert
  with check (true);

create policy "Users can update own meal plans"
  on meal_plans for update
  using (auth.uid() = user_id);


-- ─── Meal Plan Meals ───
create table if not exists meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  meal_type text not null default 'dinner' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text not null,
  description text,
  recipe_id uuid references recipes(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table meal_plan_meals enable row level security;

create policy "Users can read own meal plan meals"
  on meal_plan_meals for select
  using (
    exists (
      select 1 from meal_plans
      where meal_plans.id = meal_plan_meals.meal_plan_id
        and meal_plans.user_id = auth.uid()
    )
  );

create policy "Service role can insert meal plan meals"
  on meal_plan_meals for insert
  with check (true);

create policy "Service role can update meal plan meals"
  on meal_plan_meals for update
  using (true);


-- ─── Indexes ───
create index if not exists idx_user_profiles_user_id on user_profiles(user_id);
create index if not exists idx_user_preferences_user_id on user_preferences(user_id);
create index if not exists idx_meal_plans_user_id on meal_plans(user_id);
create index if not exists idx_meal_plan_meals_plan_id on meal_plan_meals(meal_plan_id);


-- ─── Updated-at trigger ───
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at();

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute function update_updated_at();

create trigger meal_plans_updated_at
  before update on meal_plans
  for each row execute function update_updated_at();
