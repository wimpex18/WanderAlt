// Shapes shared across the pipeline. Node runs these .ts files directly
// (type stripping), so only erasable TypeScript is allowed: no enums,
// namespaces or parameter properties.

export type SourceKind = 'fienta' | 'jsonld' | 'wordpress' | 'telegram' | 'rss' | 'html' | 'osm';

export interface Source {
  id: string;
  city: string;
  kind: SourceKind;
  url: string;
  handle: string;
  label: string;
  curated: boolean;
  config: Record<string, unknown>;
}

/** What a source said about one thing, stored verbatim in raw_items. */
export interface RawItem {
  external_id: string;
  url?: string | null;
  payload: Record<string, unknown>;
}

export const EVENT_KINDS = [
  'gig', 'club', 'film', 'exhibition', 'talk', 'theatre', 'market', 'workshop', 'festival', 'other',
] as const;
export type EventKind = typeof EVENT_KINDS[number];

/** What a source says about an event's state; null when nothing is wrong. */
export type Flag = 'cancelled' | 'postponed' | 'sold_out' | 'few_left';

/** One dated occurrence as extracted from a raw item, before places and ids. */
export interface Candidate {
  title: string;
  description?: string | null;
  starts_at: string;            // ISO 8601 with offset
  ends_at?: string | null;
  has_time: boolean;
  venue_name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_free?: boolean | null;
  price_min?: number | null;
  price_max?: number | null;
  currency?: string | null;
  ticket_url?: string | null;
  url?: string | null;
  image_url?: string | null;
  language?: string | null;
  series_key?: string | null;
  kind_hint?: string | null;    // the source's own category words
  flag?: Flag | null;           // from structured fields; prose is read in run.ts
  engine: string;               // 'fienta', 'jsonld', or the model that read it
}

/** What the classifier adds to a candidate. */
export interface Enrichment {
  kind: EventKind;
  tags: string[];
  relevance: number;            // 0..1
  title_en: string | null;
  summary_en: string | null;
  engine: string;
}
