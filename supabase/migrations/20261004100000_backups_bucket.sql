-- A private bucket for the weekly logical backup (pipeline/backup.ts). No policies: only the service
-- role reads or writes it, so nothing in it is reachable with the public key.
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do update set public = false;
