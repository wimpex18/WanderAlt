-- ============================================================
-- digest_opt_ins: the INSERT policy was `with check (true)`.
--
-- The advisor calls this "RLS Policy Always True" and the first reading
-- is that it is fine -- SELECT is service-role only, so subscriber
-- emails never leak, and the signup has to accept a stranger by
-- definition. That reading missed a column.
--
-- The table carries `user_id uuid`. Under `with check (true)` an
-- anonymous caller could insert a row naming ANY user_id, attributing a
-- newsletter subscription to somebody else's account. Nothing reads
-- that column yet, which is exactly the kind of thing that becomes a
-- bug the day something does.
--
-- `true` also accepted any text as an email, for any city, at any
-- length -- a free unbounded write surface on a public endpoint.
--
-- The replacement still accepts a stranger, which is the point of a
-- newsletter, but only for a plausible address, one of the four real
-- cities, and only anonymously or as themselves.
-- ============================================================

drop policy if exists public_insert on public.digest_opt_ins;

create policy public_insert on public.digest_opt_ins
  for insert
  with check (
        (user_id is null or user_id = auth.uid())
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
    and length(email) between 6 and 254
    and city in ('tallinn', 'helsinki', 'riga', 'vilnius')
  );

comment on policy public_insert on public.digest_opt_ins is
  'Anyone may subscribe -- that is the feature -- but only with a plausible address, a real city, and either no user_id or their own.';
