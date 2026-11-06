-- A bill's authorization row makes two PayPal POSTs (create the order, then authorize it); each needs its own
-- PayPal-Request-Id stored before the call (hard rule 4). paypal_request_id keeps the authorize call's id.
alter table payments add column order_request_id text unique;
