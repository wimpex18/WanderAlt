-- "Easy to join alone": events whose title or venue names a format built for people who turn
-- up on their own (a quiz, a game night, a craft club, an open stage, a drawing night, a
-- language night, a night for meeting people). Adult-themed listings, and ones built for a group of friends or a couple, are never marked. The
-- same two patterns live in pipeline/easy.ts for new events; keep them in step. The site calls
-- this our reading of the listing, not the organiser's word.
update public.events
set tags = array_prepend('easy-alone', tags)
where not ('easy-alone' = any(tags))
  and (title || ' ' || coalesce(venue_name, '')) ~* '(quiz|viktoriin|trivia|chess|board ?games?|lauam[aä]ng|open[- ]mic|knitting|crochet|yarn society|drink (and|&) draw|sip (and|&) paint|drawing night|language (exchange|caf[eé])|keelekohvik|make friends|friend[- ]making|friends meeting|speed friending|book club|raamatuklubi|film club)'
  and (title || ' ' || coalesce(venue_name, '')) !~* '(consent|kink|erotic|fetish|bdsm|tantra|sex|nude|naked|orgasm|18\+|adult|dating|sauna|swinger|burlesque|girls.{0,3} night|date night|couples|hen party|bachelor|team[- ]?building)';
