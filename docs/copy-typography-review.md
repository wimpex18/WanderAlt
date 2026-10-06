# Interface copy and Cyrillic typography

Reviewed 6 October 2026 for PR #233. This extends the discovery review; it preserves the existing type, colour, spacing, icons and phone/tablet breakpoints. Evidence stops at this date, not the end of 2026.

## Copy decisions

The screenshot's long Ukrainian visit badge and the starting-point explanations are interface-copy problems. Replacing the font would not remove their redundant words. Compact hints now generally use two to four words in English, Estonian, Russian and Ukrainian. A four-word target is not a rule for permission recovery, provenance, privacy or destructive confirmations: removing necessary consequences or instructions would make those worse.

| Meaning | English | Estonian | Russian | Ukrainian |
|---|---|---|---|---|
| Visit badge | New since last visit | Uued pärast viimast külastust | Новое с прошлого визита | Нові після останнього візиту |
| Selected origin | Walks start here | Jalutuskäigud algavad siit | Прогулки начинаются здесь | Прогулянки починаються тут |
| Empty origin | Choose a starting point | Vali alguspunkt | Выберите начальную точку | Виберіть початкову точку |
| Current device origin | Using your location | Kasutan sinu asukohta | Используется ваша геолокация | Використовується ваша геолокація |
| Programme origin reset | Clear for device location | Tühjenda oma asukoha kasutamiseks | Очистите поле для геолокации | Очистьте поле для геолокації |
| Unknown ticket prices | Unknown prices included | Teadmata hinnaga sündmused kaasatud | Без цены тоже показываем | Без ціни теж показуємо |
| Calendar timezone | Dates use Tallinn time | Kuupäevad Tallinna aja järgi | Даты по времени Таллинна | Дати за часом Таллінна |
| Optional mood filter | No selection means all | Valimata sobib kõik | Без выбора подходят все | Без вибору підходить усе |

The visit count and its filter are unchanged; only its label loses the weekday. Distance hints no longer repeat the selected venue name, which is already visible in the origin field. The Programme clear instruction remains because this field has no adjacent device-location action. Counts, the empty Saved sections, date/mood sheets, search hints, notification hints, account helpers and the interests explanation use the same concise approach. Dance as a category uses a noun, not the old imperative translation.

[GOV.UK's current text-input guidance](https://design-system.service.gov.uk/components/text-input/) recommends short direct labels, retained labels rather than placeholder-only instructions, and brief useful hints; screen readers read the entire hint. Its [question-page guidance](https://design-system.service.gov.uk/patterns/question-pages/) supports removing information that most people do not need. [EKI's abbreviation guidance](https://teatmik.eki.ee/teatmik/luhendamine/) cautions against abbreviation overload. The response here is to rephrase meaning, not squeeze sentences into unfamiliar initials or smaller type.

## Translation coverage

The shared phrase reader is retained. Exact phrases and typed patterns cover all three translated interfaces; Ukrainian now has the same key, pattern and placeholder checks as Estonian and Russian. Dynamic Programme apply counts, map clusters and live-pin labels, route walking text, offline/cache-age messages, Saved loading/gone messages, account confirmations, Google sign-in and review actions were checked alongside normal page copy. Sentences with different responsibilities are separate elements so the reader can translate them reliably. The legacy unsubscribe HTML also loads the shared dictionaries; its button now names alerts, because the endpoint disables notifications as well as email. GET remains read-only. Native browser dialogs follow the browser/OS locale.

Venue names, addresses, source names, user-created list names and catalogue area names are literal. Existing geographic normalization remains (for example, the catalogue's Old Town group); switching languages never translates or transliterates that identity. Explicit literal spans protect mixed kind/area metadata, suggestions, source headings and detail facts. Raw placeholders protect names that happen to match interface words such as Festival. Source titles/notes retain the existing localized-catalogue getter and English fallback, rather than being translated a second time by the UI reader. Backend diagnostics remain literal after a translated explanation.

This is a source audit plus browser and automated coverage, not a claim that every possible live-account or admin state has been exercised. No account was deleted, notification permission granted or secret entered to test copy. A native-reader editorial pass is still needed; model-authored copy is not native-reader certification. Creative-title translation quality remains separate from interface copy (DEV-34).

## Font judgment and regional evidence

Keep Geologica for Latin and Cyrillic. Inspection of the actual bundled `fonts/geologica-cyrillic.woff2` found all 65 Cyrillic code points used by the RU/UK dictionaries, including Ґґ Єє Іі Її. Its OpenType Cyrillic script includes Bulgarian, Macedonian and Serbian language systems. Browser platform-font inspection of the Ukrainian interests text confirmed a custom Geologica face, rather than an OS fallback. The existing variable weights and layout tokens are retained. The [official Geologica repository](https://github.com/googlefonts/geologica) describes its humanist/geometric direction; it was archived in April 2026, so no unverified upstream update is assumed.

| Community | Primary evidence available by the review date | Consequence for WanderAlt |
|---|---|---|
| Ukraine | MacPaw's [Fixel](https://fixel.macpaw.com/) supports the Ukrainian alphabet, has Text/Display families and an open licence. It predates 2025. Diia's [2025 logo guidelines](https://thedigital.gov.ua/storage/uploads/files/page/logo/logobuk-diya.pdf) specify e-Ukraine for the logo. | Fixel is a credible alternative, but its broad proportions are not proven equivalent to our layouts. Logo guidelines do not establish an app-body font. Neither justifies a RU/UK-only swap. |
| Russia | type.today's [September 2026 digest, published 5 October](https://type.today/ru/journal/sep26), and its [29 September Curbe identity example](https://type.today/ru/journal/zavtra) discuss current type releases and creative identity work. Its [licensing FAQ](https://type.today/ru/faq/today) distinguishes web/app licensing. | These demonstrate active type practice, not a census of event-app UI fonts. A display script or paid family is not a sensible helper-text fix under this project's constraints. |
| Belarus | Minsk design school CIDR's [4 March 2026 article](https://cidrdesign.com/blog/characters) pairs typefaces including Neue Montreal, Neue Machina and Frama with fictional characters to explain personality. | Useful evidence about matching type to purpose; educational examples and demo licences do not prove production app usage or grant free production rights. |
| Bulgaria | The [Bulgarian Cyrillic initiative](https://www.cyrillic.bgweb.bg/en/) explains Bulgarian letterforms and language selection. This current resource is undated; no sufficiently verified 2025–2026 production-app font study was found. | Cyrillic support is language-specific. If Bulgarian is added, check localized glyphs and `lang`, rather than treating all Cyrillic as Russian. Geologica already contains the relevant language system. |
| Serbia | RNIDS announced screen-oriented [Manument on 28 January 2025](https://www.rnids.rs/en/news/rnids-gives-away-manument-rnids-typeface-and-%D1%81%D1%80%D0%B1-domain-celebrates-its-13th-birthday) and [Almono on 28 January 2026](https://www.rnids.rs/en/news/7969e41216b94602); Almono is monospaced. | Free local screen families exist, but a mono face would change this app's density and tone. Serbian glyph localization matters if that language is introduced. |

No primary evidence found establishes one font used across the most fashionable apps in all five markets. Do not present these examples as that evidence. There is also no basis here for blanket Cyrillic tracking or line-height changes. The actionable checks are alphabet coverage, actual rendering, language metadata, readability and wrapping at our target widths.

## Verification

Profile/origin copy was checked in all four languages at 390, 744, 1133 and 1440px, in light and dusk, with no page-width overflow. Ukrainian phone and iPad mini portrait captures are in `docs/screenshots/copy-uk-phone-dark.jpg` and `copy-uk-mini-light.jpg`. Eight changed pages were also checked at 390 and 1440px in both themes without page-width overflow. Programme filters, date/mood sheets and sign-in helpers were exercised; source identities were checked beside translated kinds and facts. Unit checks cover short hints in every language, names that collide with UI words, dynamic counters, diagnostics and escaped literal metadata. The visit badge depends on a real previous visit; when no newer listings exist it remains hidden.

Validation: 338 tests passed, typecheck passed, changed JavaScript passed syntax checks, and the diff check passed.

Physical Safari font rendering, text-size settings and native keyboards remain part of the hardware check in DEV-31. Automated Chromium viewport checks do not certify an actual iPhone or iPad.
