-- Closing a care period: who closed it and when, how many visits it covered, and each sibling's PayPal pay link.
alter table care_periods
  add column visits integer check (visits >= 0),
  add column closed_by_member_id uuid references members deferrable initially deferred,
  add column closed_at timestamptz;
create unique index on care_periods (family_id, start_date);
alter table shares add column pay_url text;
alter table shares
  add column paypal_request_id text unique,        -- stored before the invoice is created (hard rule 4)
  add column checked_at timestamptz;               -- last time PayPal was asked whether it's paid
alter table payments add column share_id uuid references shares on delete cascade;
