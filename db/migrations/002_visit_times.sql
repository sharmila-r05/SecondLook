-- Rosa checks in and out; Margaret's "Rosa came today" records the time she said it.
alter table visits add column created_at timestamptz not null default now();
alter table visits add column checked_in_at timestamptz;
alter table visits add column checked_out_at timestamptz;
