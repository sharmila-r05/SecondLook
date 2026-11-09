-- Sandbox only: when a payout is refused for INSUFFICIENT_FUNDS, Second Look tops up its own sandbox balance with
-- PayPal's published test card and retries once. Each top-up's PayPal-Request-Id is stored here before the call.
create table balance_topups (
  id uuid primary key default gen_random_uuid(),
  paypal_request_id text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  paypal_order_id text,
  status text not null,
  created_at timestamptz not null default now()
);
