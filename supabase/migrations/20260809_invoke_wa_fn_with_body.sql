-- ============================================================
-- invoke_wa_fn(fn, body) — the same sanctioned path, with a payload.
--
-- The one-argument version hardcodes `body := '{}'`, so any function
-- taking options (a city, a limit, dry_run) could only be reached by a
-- raw net.http_post — which is exactly how crons end up with no
-- Authorization header and 401 in silence. Giving the helper a body
-- parameter means there is no reason to hand-roll the call.
--
-- Same anon key, same 60s timeout, same SECURITY DEFINER shape as the
-- original. The anon key is public by design (it ships in supabase.js);
-- what this supplies is the platform's verify_jwt check, not a secret.
-- ============================================================

create or replace function public.invoke_wa_fn(fn text, body jsonb)
returns bigint
language sql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
  SELECT net.http_post(
    url := 'https://aqnsmmbrspkbfcvougeh.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA'
    ),
    body := coalesce(body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
$function$;

comment on function public.invoke_wa_fn(text, jsonb) is
  'Invoke an edge function with a JSON body, carrying the anon key so verify_jwt:true functions do not 401. Use instead of a raw net.http_post.';
