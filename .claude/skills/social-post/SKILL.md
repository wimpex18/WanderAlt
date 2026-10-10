---
name: social-post
description: Draft, preview and publish a WanderAlt post to Instagram, Facebook and Threads. Use when asked to write, plan, schedule or send a social post, announcement or teaser for @wanderalt.
---

# Social post

The accounts are `@wanderalt` on Instagram and Threads and the WanderAlt Facebook Page. Rules are in AGENTS.md (Security and services) and README (Social access); read both lines before sending.

## Flow

1. **Facts.** Use only what the user gave you or the catalogue holds. Never invent dates, times, prices, venues or photos. A venue or event photo needs checked identity and attribution; otherwise use the brand card.
2. **Voice.** Handles start with `@`. No exclamation marks, no marketing register, never "discover" as a verb. Threads is at most 500 characters. Instagram says "link in bio", not a URL. See `brand/social/teaser/posts.md` for examples.
3. **Picture.** A 1080×1350 JPEG, made from the brand type and colours (see `brand/social/teaser/*.svg`, Geologica 700, vermilion `#d83a14`). Commit it under `brand/social/<campaign>/`. It must be live at `https://wanderalt.app/brand/social/…` before sending, which means merged and deployed.
4. **Post file.** One JSON file per post next to its picture (`brand/social/teaser/1-soon.json` is the model): `image`, `alt`, `location`, and the text for `facebook`, `instagram`, `threads`. Tallinn's Facebook Places ID is `106039436102339` (confirmed by the owner). Threads uses its own IDs and the token lacks the location scope, so leave `threadsLocation` out.
5. **Preview.** `npm run social -- post FILE.json` prints each platform's text and checks that the picture is public. It sends nothing.
6. **Show, then send.** Show the user the final text and picture. Send only after they ask for that post: `npm run social -- post FILE.json --publish`. Use `--to instagram,facebook` for a subset.
7. **Failures.** Each platform reports on its own. If a location is refused, nothing was posted on that platform: tell the user, and rerun with `--no-location` only if they agree. Never rerun a platform that may have posted; check it first.

## Never

- Print, paste or log a token. Secrets stay in the git-ignored `.env` or repository secrets.
- Publish unattended, on a schedule, or in a loop, unless the owner has turned that on.
- Post anything the user has not seen in its final form.
