-- This project's default privileges hand every new public table to anon and
-- authenticated in full. RLS already refused what the policies do not allow,
-- but TRUNCATE and the rest should not be granted at all. Narrow the five
-- tables from the alerts work to exactly what each is for.

revoke all on public.problem_reports, public.follows, public.push_subscriptions from anon, authenticated;
grant insert on public.problem_reports to anon, authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
