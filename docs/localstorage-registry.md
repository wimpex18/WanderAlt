# WanderAlt — localStorage key registry (June 2026)

Canonical inventory of every browser-storage key the app writes (ROADMAP P3).
Three naming conventions exist historically; **new keys use the `wa:` prefix**
and SHOULD carry a `:v1` version suffix when they store a structured shape
(the `wanderalt:*:v1` family is the only versioned one today — any shape
change to an unversioned key has no migration story and will silently
misparse).

| Key | Owner file | Shape | Versioned | Purpose / notes |
|---|---|---|---|---|
| `wa:city` | `city.js` | string (`tallinn`/`riga`/`helsinki`/`vilnius`) | no | Active city. Read by `catalog.js` before `city.js` runs (load-order dependency). |
| `wa:saved-snapshots` | `saved.js` | `{ [pickId]: {id,title,venue,neighborhood,kind,day,time,handle} }` | no | Change-watch (A2): last-seen snapshot per bookmarked pick; powers "time changed" badges + gone-rows. Gone-detection additionally gated on `WA.DATA_LIVE`. |
| `wa-taste-prefs` | `taste.js` (`PREFS_KEY`) | `{ energy?, company?, money? }` strings | no | Taste-profile axes from onboarding. |
| `wa-taste-onboarded` | `taste.js` | `"1"` flag | no | Onboarding completed/skipped. |
| `wa-match-feedback` | `taste.js` (`FEEDBACK_KEY`) | object keyed by pick id | no | Concierge thumbs feedback (on-device). |
| `wa-match-seen` | `taste.js` (`SEEN_KEY`) | object/array of pick ids | no | Concierge "already shown" memory. |
| `wanderalt:bookmarks:v1` | `bookmark.js` | `{ [pickId]: true }` | **yes** | Primary bookmark store; cloud-synced for signed-in users (`bookmarks` table, last-write-wins per id). |
| `wanderalt:session:v1` | `auth.js` (`SESSION_KEY`) | `{access_token,user_id,email,expires_at}` | **yes** | Auth session. |
| `wa-admin-key` | `admin.js` | string (service-role key) | no | **Desktop admin tool only.** Never ship on public pages. |
| `wa-admin-city` | `admin.js` | string | no | Admin panel's own city filter (separate from `wa:city`). |
| `wa-admin-session` | `admin.js` | object | no | Admin auth session. |

Rules:
1. **Adding a key:** use `wa:` prefix, register it here in the same PR, and
   version (`:v1`) anything structured.
2. **Changing a shape:** bump the version suffix and write a one-shot
   migration in the owner file (read old key → write new → remove old);
   unversioned legacy keys get the same treatment as part of the change.
3. The smoke/e2e harnesses set `wa:city` and `wanderalt:session:v1` directly —
   keep those names stable or update `.screenshots/*.js` in the same PR.
