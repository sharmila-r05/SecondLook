-- A family's own rules and how it came to be. The ready-made demo family ("ready") starts with these defaults; a
-- family a visitor sets up ("setup") gets them from the person who set it up, and Sarah or Tom can change them later.

alter table families
  add column origin text not null default 'ready' check (origin in ('ready', 'setup')),
  add column organizer_member_id uuid references members deferrable initially deferred,
  -- What sends a payment for a second look (risk.ts RiskPolicy).
  add column limit_cents bigint not null default 30000 check (limit_cents > 0),
  add column daily_limit_cents bigint not null default 50000 check (daily_limit_cents > 0),
  add column unusual_multiple integer not null default 3 check (unusual_multiple between 2 and 10),
  -- How long a held payment waits for an answer before it's cancelled. PayPal keeps an authorization for 29 days.
  add column hold_minutes integer not null default 10 check (hold_minutes between 1 and 4320),
  -- Who gets the alert: both children, or only the one who set the family up.
  add column ask text not null default 'everyone' check (ask in ('everyone', 'organizer')),
  add column visit_rate_cents bigint not null default 5000 check (visit_rate_cents >= 0),
  -- Set-up progress: the step the organizer is on, null once done.
  add column setup_step text check (setup_step in ('bills', 'rules', 'care', 'devices')),
  add column setup_completed_at timestamptz,
  -- Margaret agreed to Second Look on her own screen.
  add column parent_agreed_at timestamptz;

-- Families made before this migration are ready-made ones: Sarah set them up, Margaret agreed.
update families f set
  organizer_member_id = (select m.id from members m where m.family_id = f.id and m.role = 'child' order by m.name limit 1),
  setup_completed_at = f.created_at,
  parent_agreed_at = f.created_at;

-- A known payee's own limit is now optional: without one, the family's limit applies, so changing it moves them all.
update payees set per_payment_limit_cents = null where per_payment_limit_cents = 30000;

-- When a device first opened this person's screen from an invite.
alter table members add column joined_at timestamptz;

-- An invite opens as one person (Margaret's tablet, the sibling's phone, Rosa's phone) and lasts days, not minutes.
-- A code without a member is the family screen's own "open on your phone" QR code.
alter table join_codes add column member_id uuid references members on delete cascade;

-- Signing in by email. The address itself is never stored: only an HMAC of it, enough to find the account again.
create table accounts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique,
  demo_session_id uuid not null,                    -- the family this account comes back to
  -- Who this account is in that family. The cast is fixed, so a name still means the same person after a Reset.
  member_name text check (member_name in ('Margaret', 'Sarah', 'Tom', 'Rosa')),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create index on accounts (demo_session_id);

create table sign_in_codes (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,                    -- the session that asked for it
  email_hash text not null,
  token_hash text not null unique,                  -- the link's secret, hashed
  code_hash text not null,                          -- the six-digit code, hashed with this row's id
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on sign_in_codes (email_hash, created_at);
create index on sign_in_codes (demo_session_id, created_at);
