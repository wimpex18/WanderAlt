-- ============================================================
-- Clear the geocode_failed_at stamps produced by geocode-picks v6/v7.
--
-- v8 fixed three bugs in that function; two of them wrote failures that
-- were never the venue's fault:
--
--   * The Nominatim query included the pick's neighborhood, and Nominatim
--     treats every term in a free-text search as a constraint. Pick
--     neighborhoods are LLM-assigned and often wrong -- Von Krahl is
--     filed under Vanalinn but stands in Kalamaja -- so the query matched
--     nothing and the venue was stamped as unresolvable. Measured against
--     eight venues across all four cities, the neighborhood-qualified
--     query matched ZERO and the plain one matched every venue that
--     actually exists in OSM.
--   * A non-OK HTTP response was indistinguishable from "no such place",
--     so a single 429 benched a findable venue for FAIL_COOLDOWN_DAYS.
--
-- A stamp means "we asked properly and the place is not in OSM", and none
-- of these did. Left alone they would have suppressed retries for two
-- weeks, which is most of the useful life of an event listing.
--
-- Scoped to the six hours around the v6/v7 run rather than the whole
-- column: older stamps were written under different code and there is no
-- evidence they are wrong.
--
-- 186 rows cleared when this ran (Tallinn only -- the other three cities
-- had never been geocoded at all, which was bug 3). 142 of those carry a
-- placeholder venue name and are now skipped before any call is made, so
-- clearing them costs nothing.
-- ============================================================

update picks
   set geocode_failed_at = null
 where archived_at is null
   and geocode_failed_at is not null
   and geocode_failed_at > now() - interval '6 hours';
