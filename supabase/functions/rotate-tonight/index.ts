// rotate-tonight — promote a Tonight pick when none is flagged
//
// Runs nightly at 04:05 UTC (07:05 Tallinn) after archive-stale clears
// yesterday's Tonight pick. Promotes the best this_week candidate:
//   1. Specific venue + day matches today's weekday in Tallinn TZ
//   2. Any specific venue + this_week (day matches today)
//   3. No promotion — Tonight stays blank rather than show a stale pick
//
// Also callable on demand from the admin panel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GENERIC_VENUES = new Set(['various venues', 'various', 'tba', 'tbd', '']);

/** Day abbreviation for today in Tallinn (Europe/Tallinn). */
function todayInTallinn(): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Intl gives us the correct local date even across DST
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Tallinn' }));
  return days[d.getDay()];
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: logRow } = await sb
    .from('ingest_log')
    .insert({ fn: 'rotate-tonight', status: 'running', inserted: 0, rejected: 0 })
    .select('id').single();
  const logId = logRow?.id;

  const finish = async (status: string, detail: unknown, error?: string) =>
    sb.from('ingest_log').update({
      status, detail, error: error ?? null, finished_at: new Date().toISOString(),
    }).eq('id', logId);

  try {
    // 1. Already have a valid Tonight pick? Nothing to do.
    const { data: current } = await sb
      .from('picks')
      .select('id, title')
      .eq('tonight', true)
      .is('archived_at', null)
      .limit(1);

    if (current?.length) {
      await finish('ok', { action: 'noop', id: current[0].id, title: current[0].title });
      return Response.json({ ok: true, action: 'noop', current: current[0].title });
    }

    const today = todayInTallinn(); // e.g. 'Sat'

    // 2. Fetch all this_week candidates (cap at 50 for safety).
    const { data: candidates } = await sb
      .from('picks')
      .select('id, title, venue, day')
      .eq('this_week', true)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50);

    if (!candidates?.length) {
      await finish('ok', { action: 'noop', reason: 'no this_week picks' });
      return Response.json({ ok: true, action: 'noop', reason: 'no candidates' });
    }

    // 3. Score candidates. Prefer today+specific > today+generic.
    //    Decline to promote picks from other days to avoid showing
    //    "Thursday" events on Saturday.
    const todayCandidates = candidates.filter(p => p.day === today || p.day === 'Tonight');

    if (!todayCandidates.length) {
      await finish('ok', { action: 'noop', reason: `no ${today} picks in this_week`, today });
      return Response.json({ ok: true, action: 'noop', reason: `no picks for ${today}` });
    }

    // Prefer specific venues over "Various venues".
    const specific = todayCandidates.filter(p => !GENERIC_VENUES.has(p.venue?.toLowerCase()));
    const promoted  = specific.length ? specific[0] : todayCandidates[0];

    const { error: promoteErr } = await sb
      .from('picks')
      .update({ tonight: true })
      .eq('id', promoted.id);

    if (promoteErr) throw promoteErr;

    await finish('ok', { action: 'promoted', id: promoted.id, title: promoted.title, day: promoted.day, today });
    return Response.json({ ok: true, action: 'promoted', title: promoted.title, day: promoted.day });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finish('error', null, msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
