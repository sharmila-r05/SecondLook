-- Second Look: initial schema.
-- Money is integer cents (bigint). Every per-family row carries demo_session_id, and every family-owned table
-- cascades from families, so resetting a demo session is a single `delete from families where demo_session_id = $1`.
-- References between two family-owned tables (a share's member, a payment's request, ...) are deferrable: Postgres
-- runs each cascade branch as its own step, and an immediate check would fire while the other side still exists.
-- Deferred, they are checked at commit, after the whole family is gone; deleting a row that is still referenced
-- is still refused.

create table families (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  name text not null,
  split_rule jsonb not null,                       -- {"<member id>": 50, ...}, percentages summing to 100
  created_at timestamptz not null default now()
);
create index on families (demo_session_id);

create table members (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  name text not null,
  role text not null check (role in ('parent', 'child', 'aide')),
  paypal_email text
);
create index on members (family_id);

create table payees (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  name text not null,
  aliases text[] not null default '{}',            -- "electric bill", "power company"
  paypal_email text,
  known boolean not null default false,
  per_payment_limit_cents bigint check (per_payment_limit_cents >= 0),
  usual_amount_cents bigint check (usual_amount_cents >= 0)
);
create index on payees (family_id);

create table payment_requests (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  payee_id uuid references payees deferrable initially deferred,
  amount_cents bigint not null check (amount_cents > 0),
  request_text text not null,
  status text not null check (status in
    ('new', 'approved_auto', 'held', 'approved_by_family', 'denied', 'expired', 'paid', 'voided')),
  triggered_rules jsonb not null default '[]',
  risk_note text,
  decided_by_member_id uuid references members deferrable initially deferred,
  hold_expires_at timestamptz,                     -- now() + HOLD_TIMEOUT_MINUTES when held
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payment_requests (family_id, created_at);

create table visits (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  aide_member_id uuid not null references members deferrable initially deferred,
  visit_date date not null,
  confirmed_by text not null check (confirmed_by in ('aide', 'parent')),
  rate_cents bigint not null check (rate_cents >= 0),
  unique (aide_member_id, visit_date)              -- "Rosa came today" twice is one visit
);

create table care_periods (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  start_date date not null,
  end_date date not null,
  total_cents bigint check (total_cents >= 0),
  status text not null check (status in ('open', 'closing', 'closed')),
  payout_sender_batch_id text unique,              -- fixed before the first payout attempt
  check (end_date >= start_date)
);
create index on care_periods (family_id);

create table shares (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  care_period_id uuid not null references care_periods on delete cascade,
  member_id uuid not null references members deferrable initially deferred,
  amount_cents bigint not null check (amount_cents >= 0),
  invoice_number text unique,                      -- fixed before the first create (Invoicing ignores request IDs)
  paypal_invoice_id text,
  status text not null check (status in ('pending', 'sent', 'paid'))
);
create index on shares (care_period_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  payment_request_id uuid references payment_requests deferrable initially deferred,
  care_period_id uuid references care_periods deferrable initially deferred,
  kind text not null check (kind in ('authorization', 'capture', 'void', 'payout', 'invoice', 'refund')),
  paypal_order_id text,
  paypal_authorization_id text,
  paypal_capture_id text,
  paypal_payout_batch_id text,
  paypal_invoice_id text,
  paypal_request_id text not null unique,          -- generated and stored BEFORE the call (hard rule 4)
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null,
  created_at timestamptz not null default now()
);
create index on payments (family_id, created_at);
create index on payments (payment_request_id);

create table events (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid references families on delete cascade,
  type text not null,                              -- 'request:held', 'paypal:PAYMENT.AUTHORIZATION.VOIDED', ...
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on events (family_id, created_at);

-- Not per session: PayPal redelivers by event ID, whichever session the event belongs to.
create table paypal_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

create table push_subscriptions (
  endpoint text primary key,
  demo_session_id uuid not null,
  member_id uuid references members on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- Cost caps (hard rule 9). The session lives in the scope, so daily totals can sit in the same table.
create table usage_counters (
  scope text not null,                             -- 'session:<id>' or 'day:2026-11-07'
  kind text not null,                              -- 'llm' or 'voice_seconds'
  count integer not null default 0 check (count >= 0),
  primary key (scope, kind)
);
