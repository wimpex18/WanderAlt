-- Film audio is a performance language too; Kai lists Korean-language films.
+alter table public.events drop constraint events_event_languages_check;
alter table public.events add constraint events_event_languages_check
  check (event_languages <@ array['en','et','ru','uk','fi','sv','de','fr','es','it','lv','lt','pl','ja','zh','ko']::text[]);
