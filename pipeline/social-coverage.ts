import { instagramHandle } from './instagram.ts';
import type { Place } from './places.ts';
import type { Db } from './db.ts';

export function venueCoverage(rows: Place[]) {
  const places = rows.filter(p => (p.status ?? 'active') === 'active' && !p.merged_into);
  const handles = new Set(places.map(p => instagramHandle(p.instagram)?.toLowerCase()).filter(Boolean));
  return {
    places: places.length, picked: places.filter(p => p.picked).length, instagram_handles: handles.size,
    picked_without_instagram: places.filter(p => p.picked && !instagramHandle(p.instagram)).map(p => ({ id: p.id, name: p.name })),
    missing: Object.fromEntries(['opening_hours', 'website', 'description', 'image_url'].map(field =>
      [field, places.filter(p => !p[field as keyof Place]).length])),
  };
}

/** Database coverage, not a token check or proof of review approval. No writes or model calls. */
export async function socialCoverage(db: Pick<Db, 'all' | 'select'>) {
  const places = await db.all<Place>('places?city=eq.tallinn&select=id,city,name,status,merged_into,picked,instagram,opening_hours,website,description,image_url&order=id.asc');
  const raw = await db.all<{ status: string }>('raw_items?source_id=eq.instagram-venues&select=id,status&order=id.asc');
  const sources = await db.select('sources?id=in.(instagram-venues,heldeke-fienta)&select=id,active,last_ok_at,last_yield,last_error');
  const upcoming = await db.all<{ event_id: string }>(`event_sources?source_id=eq.instagram-venues&select=event_id,events!inner(status,starts_at,archived_at,merged_into)&events.status=eq.published&events.starts_at=gte.${new Date().toISOString()}&events.archived_at=is.null&events.merged_into=is.null&order=event_id.asc`);
  return {
    checked_at: new Date().toISOString(), coverage: venueCoverage(places), sources,
    instagram_queue: Object.fromEntries(['new', 'done', 'skipped', 'error'].map(s => [s, raw.filter(r => r.status === s).length])),
    upcoming_published_with_instagram_provenance: new Set(upcoming.map(r => r.event_id)).size,
    capabilities: {
      publishing: 'Own Facebook Page, Instagram and Threads: manual tools; use social check for current token health.',
      venue_reading: 'Known public Instagram Business/Creator handles: profile picture, bio, website and recent media. Hours only when explicitly stated.',
      facebook_public_metadata: 'Blocked pending eligible verification and App Review.',
      threads_public_search: 'Unapproved: keyword search is own posts only; profile lookup is Meta accounts only.',
      instagram_hashtags: 'Experimental, scheduled source disabled pending approved use case.',
      app_ai_search: 'Queries our stored catalogue only; no live social search.',
    },
  };
}
