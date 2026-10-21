-- 002: ghost members, card/cash, soft delete. Money rows now point at group_members.id, not user ids.
-- Run once on databases created from the original schema.sql (fresh installs just use schema.sql).

-- group_members gets its own id + display name; user_id null = ghost (name only, never signed up)
alter table group_members add column id uuid not null default gen_random_uuid();
alter table group_members add column name text;
alter table group_members add column joined_at timestamptz not null default now();
update group_members m set name = p.name from profiles p where p.id = m.user_id;
alter table group_members alter column name set not null;
alter table group_members drop constraint group_members_pkey;
alter table group_members add primary key (id);
alter table group_members alter column user_id drop not null;
alter table group_members add unique (group_id, user_id);
alter table group_members add unique (id, group_id);
alter table group_members drop constraint group_members_user_id_fkey;
alter table group_members add foreign key (user_id) references profiles on delete set null;

-- expenses: paid_by user -> member
alter table expenses drop constraint expenses_paid_by_fkey;
update expenses e set paid_by = m.id from group_members m where m.group_id = e.group_id and m.user_id = e.paid_by;
alter table expenses add foreign key (paid_by, group_id) references group_members (id, group_id);
alter table expenses add column payment_method text not null default 'cash' check (payment_method in ('cash', 'card'));
alter table expenses add column updated_at timestamptz not null default now();
alter table expenses add column deleted_at timestamptz;

-- expense_splits: user -> member
alter table expense_splits drop constraint expense_splits_user_id_fkey;
alter table expense_splits rename column user_id to member_id;
update expense_splits s set member_id = m.id
  from expenses e join group_members m on m.group_id = e.group_id
  where e.id = s.expense_id and m.user_id = s.member_id;
alter table expense_splits add foreign key (member_id) references group_members (id);

-- settlements: users -> members
alter table settlements drop constraint settlements_from_user_fkey;
alter table settlements drop constraint settlements_to_user_fkey;
alter table settlements rename column from_user to from_member;
alter table settlements rename column to_user to to_member;
update settlements s set from_member = m.id from group_members m where m.group_id = s.group_id and m.user_id = s.from_member;
update settlements s set to_member = m.id from group_members m where m.group_id = s.group_id and m.user_id = s.to_member;
alter table settlements add foreign key (from_member, group_id) references group_members (id, group_id);
alter table settlements add foreign key (to_member, group_id) references group_members (id, group_id);
alter table settlements add column created_by uuid references profiles;
