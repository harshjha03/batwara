-- Run once in Supabase → SQL Editor (fresh project).
-- Member FKs are deferred (checked at commit) so deleting a group can cascade through members and expenses.
-- RLS is on with no policies: the public anon/publishable key can't touch these tables.
-- The app reads/writes them server-side over DATABASE_URL (table owner, bypasses RLS).

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

-- One row per person in a group. user_id null = "ghost" (name only, never signed up).
create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  user_id uuid references profiles on delete set null,
  name text not null,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id),
  unique (id, group_id) -- lets money rows FK on (member, group) so members can't cross groups
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by uuid not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card')),
  created_by uuid not null references profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- soft delete
  foreign key (paid_by, group_id) references group_members (id, group_id) deferrable initially deferred
);

create table expense_splits (
  expense_id uuid references expenses on delete cascade,
  member_id uuid references group_members deferrable initially deferred,
  share_cents integer not null check (share_cents >= 0),
  primary key (expense_id, member_id)
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  created_by uuid references profiles,
  created_at timestamptz not null default now(),
  check (from_member <> to_member),
  foreign key (from_member, group_id) references group_members (id, group_id) deferrable initially deferred,
  foreign key (to_member, group_id) references group_members (id, group_id) deferrable initially deferred
);

-- Activity history log. details denormalized so lines read after the referenced row is gone.
create table activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references groups on delete cascade,
  actor_id uuid references profiles on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index on expenses (group_id);
create index on settlements (group_id);
create index on activity (group_id, created_at desc);

alter table profiles enable row level security;
alter table activity enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;
