-- Each visit remembers the care week that paid it. Before, a week covered every visit up to the day it was closed, so a
-- visit logged later that same day fell between that week and the next and was never paid. An unpaid visit has none.
alter table visits add column care_period_id uuid references care_periods (id) on delete set null;

-- Visits already in a closed or closing week: the week whose dates cover them (weeks never overlapped before this).
update visits v set care_period_id = cp.id
from care_periods cp
where cp.family_id = v.family_id and v.visit_date between cp.start_date and cp.end_date;

create index on visits (family_id) where care_period_id is null;
