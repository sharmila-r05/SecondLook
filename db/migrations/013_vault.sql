-- Margaret connects PayPal once (Vault v3): after that her bills are paid from the saved PayPal with no PayPal page.
-- Only the parent has a saved PayPal. What's kept is PayPal's token id and customer id, never her email or name.
alter table members add column paypal_vault_id text;           -- the payment token id orders name as vault_id
alter table members add column paypal_customer_id text;        -- PayPal's customer id for that vault
alter table members add column vaulted_at timestamptz;
alter table members add constraint members_vault_parent_only check (paypal_vault_id is null or role = 'parent');

-- One row per "Connect PayPal" attempt. Both PayPal POSTs (setup token, then payment token) have their
-- PayPal-Request-Id stored here before the call (hard rule 4).
create table vault_setups (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null,
  family_id uuid not null references families on delete cascade,
  member_id uuid not null references members deferrable initially deferred,
  setup_request_id text not null unique,
  token_request_id text not null unique,
  paypal_setup_token_id text,
  status text not null,                                          -- 'creating', then PayPal's status, 'VAULTED' or 'CANCELLED'
  created_at timestamptz not null default now()
);
create index on vault_setups (family_id, created_at);
