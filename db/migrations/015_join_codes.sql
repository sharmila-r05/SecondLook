-- "Open on your phone": a short code that lets a second device join this demo session for a few minutes, so the
-- session id itself never appears in a QR code or a URL.
create table join_codes (
  code text primary key,
  demo_session_id uuid not null,
  expires_at timestamptz not null
);
create index on join_codes (demo_session_id);
