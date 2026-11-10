-- Claude's second opinion on a payment, asked for while Margaret's request is read back to her and looked up when she
-- says "Yes, pay it" (by a hash of what was read back). It can only add a hold; the rules still decide on their own.
create table second_opinions (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  request_key text not null,
  status text not null check (status in ('pending', 'done', 'skipped', 'failed')),
  concern boolean,
  pattern text,
  reason text,
  model text,
  ms integer,
  created_at timestamptz not null default now(),
  unique (family_id, request_key)
);
