-- 004: activity history log. One row per action, written by the server actions.
-- details is denormalized (names/amounts stored inline) so a line still reads after
-- the expense/member it refers to is gone.
create table activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references groups on delete cascade,
  actor_id uuid references profiles on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on activity (group_id, created_at desc);
alter table activity enable row level security;
