# AsuTorrent — Localization Tracker (TODO_LOCALES.md)

> **Legend**: ✅ Done | 🚧 In progress | ⬜ Planned | 💡 Idea | ❌ Declined

Отдельный трекер локализаций — вынесен из `TODO.md`, потому что список языков планируется расширять. Каждый язык имеет оценку **сложности вёрстки** (насколько «безопасно» добавить перевод без проверки UI) и **примерное число носителей** (L1+L2, млн) для расстановки приоритетов.

В трекере **187 позиций** — все **184 кода ISO 639-1** + 3 локальных варианта (en-gb, pt-br, zh-tw), без учёта фан-локализаций: **19 готово**, 9 в плане, **159 идей**. Языки без двухбуквенного кода (например, питкернский/норфукский, ISO 639-3 `pih`) сюда не входят — в 639-1 всего 184 кода.

> **Приоритет** (по числу носителей): 🔥 ≥100 млн · ⭐ 10–99 млн · ○ <10 млн. Реальный порядок работы = приоритет × сложность: дешёвые 🟢-языки с миллионами носителей делаются в первую очередь, а 🔴 RTL / 🟠 Tricky с тем же числом носителей — в последнюю (вёрстка дороже).

---

## 🧭 Сложность вёрстки (Layout difficulty)

Главный разделитель — **направление письма** и **скрипт**, а не сам язык. Европейские языки (LTR + латиница/кириллица) вёрстаются как английский: знакомое поведение строк, та же геометрия, предсказуемый результат — их можно добавлять быстро, по одной схеме, без отладки UI. Арабский, иврит и подобные «каракули» пишутся не так, как английский (справа налево, связная вязь, другая высота глифов), поэтому как поведёт себя UI — заранее неизвестно, нужна проверка и, возможно, доработка вёрстки.

| Уровень | Значение |
|---------|----------|
| 🟢 Simple | LTR + латиница/кириллица. Вёрстка как в английском, проблемы маловероятны. Быстрое добавление «на потоке» |
| 🟡 Medium | Особые глифы (CJK, хангыль, греческий, армянский, грузинский) или длинные слова/диакритика — возможны переполнения строк, но LTR сохраняется |
| 🟠 Tricky | Сложный скрипт или правила переноса (тайский без пробелов, индийские скрипты, эфиопский) — нужна проверка высоты строк и переносов |
| 🔴 RTL | Направление письма справа налево — требуется зеркальная вёрстка UI (`dir="rtl"`), флексы/паддинги/иконки. Без проверки не включать |

---

## 🌍 Real Languages (i18n) — Настоящие переводы

### 🟢 Simple — LTR, латиница/кириллица (вёрстка как в английском) — 138 языков

| Code | Language | Носители (млн) | Приоритет | Status |
|------|----------|----------------|-----------|--------|
| en | English / English | ~1500 | 🔥 | ✅ Complete |
| en-gb | British English / English (UK) | ~600 | 🔥 | ✅ Complete |
| es | Spanish / Español | ~550 | 🔥 | ✅ Complete |
| fr | French / Français | ~280 | 🔥 | ✅ Complete |
| ru | Russian / Русский | ~260 | 🔥 | ✅ Complete |
| pt | Portuguese / Português | ~260 | 🔥 | ✅ Complete |
| pt-br | Portuguese (Brazil) / Português (Brasil) | ~260 | 🔥 | ✅ Complete |
| id | Indonesian / Bahasa Indonesia | ~200 | 🔥 | ✅ Complete |
| de | German / Deutsch | ~130 | 🔥 | ✅ Complete |
| sw | Swahili / Kiswahili | ~100 | 🔥 | 💡 Idea |
| tr | Turkish / Türkçe | ~85 | ⭐ | ⬜ Planned |
| jv | Javanese / Basa Jawa | ~82 | ⭐ | 💡 Idea |
| ms | Malay / Bahasa Melayu | ~80 | ⭐ | 💡 Idea |
| tl | Filipino / Tagalog | ~70 | ⭐ | 💡 Idea |
| it | Italian / Italiano | ~68 | ⭐ | ✅ Complete |
| ha | Hausa / Hausa | ~65 | ⭐ | 💡 Idea |
| yo | Yoruba / Yorùbá | ~45 | ⭐ | 💡 Idea |
| pl | Polish / Polski | ~45 | ⭐ | ✅ Complete |
| su | Sundanese / Basa Sunda | ~42 | ⭐ | 💡 Idea |
| uk | Ukrainian / Українська | ~40 | ⭐ | ✅ Complete |
| om | Oromo / Afaan Oromoo | ~38 | ⭐ | 💡 Idea |
| uz | Uzbek / Oʻzbekcha | ~35 | ⭐ | 💡 Idea |
| ff | Fulah / Fulfulde | ~35 | ⭐ | 💡 Idea |
| az | Azerbaijani / Azərbaycan | ~30 | ⭐ | 💡 Idea |
| zu | Zulu / isiZulu | ~27 | ⭐ | 💡 Idea |
| ig | Igbo / Igbo | ~27 | ⭐ | 💡 Idea |
| nl | Dutch / Nederlands | ~25 | ⭐ | ✅ Complete |
| ro | Romanian / Română | ~25 | ⭐ | ⬜ Planned |
| mg | Malagasy / Malagasy | ~25 | ⭐ | 💡 Idea |
| so | Somali / Soomaali | ~22 | ⭐ | 💡 Idea |
| af | Afrikaans / Afrikaans | ~17 | ⭐ | 💡 Idea |
| ln | Lingala / Lingála | ~15 | ⭐ | 💡 Idea |
| tg | Tajik / Тоҷикӣ | ~14 | ⭐ | 💡 Idea |
| bm | Bambara / Bamanankan | ~14 | ⭐ | 💡 Idea |
| sv | Swedish / Svenska | ~13 | ⭐ | ✅ Complete |
| hu | Hungarian / Magyar | ~13 | ⭐ | ⬜ Planned |
| kk | Kazakh / Қазақша | ~13 | ⭐ | 💡 Idea |
| rn | Rundi / Ikirundi | ~13 | ⭐ | 💡 Idea |
| rw | Kinyarwanda / Ikinyarwanda | ~12 | ⭐ | 💡 Idea |
| wo | Wolof / Wolof | ~12 | ⭐ | 💡 Idea |
| cs | Czech / Čeština | ~12 | ⭐ | ⬜ Planned |
| sr | Serbian / Српски | ~12 | ⭐ | 💡 Idea |
| sn | Shona / chiShona | ~11 | ⭐ | 💡 Idea |
| ht | Haitian Creole / Kreyòl ayisyen | ~11 | ⭐ | 💡 Idea |
| ak | Akan / Ákán | ~11 | ⭐ | 💡 Idea |
| ny | Chichewa / Chichewa | ~10 | ⭐ | 💡 Idea |
| ca | Catalan / Català | ~9 | ○ | 💡 Idea |
| xh | Xhosa / isiXhosa | ~9 | ○ | 💡 Idea |
| tw | Twi / Twi | ~9 | ○ | 💡 Idea |
| bg | Bulgarian / Български | ~8 | ○ | 💡 Idea |
| qu | Quechua / Runasimi | ~8 | ○ | 💡 Idea |
| kr | Kanuri / Kanuri | ~8 | ○ | 💡 Idea |
| ki | Kikuyu / Gĩkũyũ | ~7 | ○ | 💡 Idea |
| ee | Ewe / Eʋegbe | ~7 | ○ | 💡 Idea |
| lg | Ganda / Luganda | ~7 | ○ | 💡 Idea |
| tk | Turkmen / Türkmençe | ~7 | ○ | 💡 Idea |
| gn | Guarani / Avañeʼẽ | ~7 | ○ | 💡 Idea |
| da | Danish / Dansk | ~6 | ○ | ✅ Complete |
| mn | Mongolian / Монгол | ~6 | ○ | 💡 Idea |
| tn | Tswana / Setswana | ~5.7 | ○ | 💡 Idea |
| st | Sesotho / Sesotho | ~5.6 | ○ | 💡 Idea |
| kg | Kongo / Kikongo | ~5.6 | ○ | 💡 Idea |
| no | Norwegian / Norsk | ~5.5 | ○ | 💡 Idea |
| fi | Finnish / Suomi | ~5.5 | ○ | ⬜ Planned |
| sk | Slovak / Slovenčina | ~5.5 | ○ | 💡 Idea |
| sq | Albanian / Shqip | ~5.5 | ○ | 💡 Idea |
| hr | Croatian / Hrvatski | ~5.5 | ○ | 💡 Idea |
| sg | Sango / Sängö | ~5.5 | ○ | 💡 Idea |
| nb | Norwegian Bokmål / Norsk bokmål | ~5.5 | ○ | 💡 Idea |
| tt | Tatar / Татарча | ~5 | ○ | 💡 Idea |
| be | Belarusian / Беларуская | ~5 | ○ | 💡 Idea |
| ky | Kyrgyz / Кыргызча | ~5 | ○ | 💡 Idea |
| ts | Tsonga / Xitsonga | ~4 | ○ | 💡 Idea |
| bs | Bosnian / Bosanski | ~3 | ○ | 💡 Idea |
| lt | Lithuanian / Lietuvių | ~3 | ○ | 💡 Idea |
| gl | Galician / Galego | ~2.5 | ○ | 💡 Idea |
| ay | Aymara / Aymar aru | ~2.5 | ○ | 💡 Idea |
| sl | Slovenian / Slovenščina | ~2.5 | ○ | 💡 Idea |
| aa | Afar / Qafar af | ~2.5 | ○ | 💡 Idea |
| ss | Swati / siSwati | ~2.3 | ○ | 💡 Idea |
| eo | Esperanto / Esperanto | ~2 | ○ | 💡 Idea |
| lu | Luba-Katanga / Kiluba | ~2 | ○ | 💡 Idea |
| ce | Chechen / Нохчийн | ~1.8 | ○ | 💡 Idea |
| nd | North Ndebele / isiNdebele | ~1.6 | ○ | 💡 Idea |
| mk | Macedonian / Македонски | ~1.5 | ○ | 💡 Idea |
| lv | Latvian / Latviešu | ~1.5 | ○ | 💡 Idea |
| ba | Bashkir / Башҡортса | ~1.4 | ○ | 💡 Idea |
| li | Limburgish / Limburgs | ~1.3 | ○ | 💡 Idea |
| ve | Venda / Tshivenḓa | ~1.3 | ○ | 💡 Idea |
| sc | Sardinian / Sardu | ~1.2 | ○ | 💡 Idea |
| ga | Irish / Gaeilge | ~1.2 | ○ | 💡 Idea |
| nr | South Ndebele / isiNdebele | ~1.1 | ○ | 💡 Idea |
| et | Estonian / Eesti | ~1.1 | ○ | 💡 Idea |
| eu | Basque / Euskara | ~1 | ○ | 💡 Idea |
| cv | Chuvash / Чӑвашла | ~1 | ○ | 💡 Idea |
| cy | Welsh / Cymraeg | ~0.9 | ○ | 💡 Idea |
| ng | Ndonga / Oshindonga | ~0.81 | ○ | 💡 Idea |
| av | Avar / Магӏарул мацӏ | ~0.8 | ○ | 💡 Idea |
| os | Ossetian / Ирон | ~0.6 | ○ | 💡 Idea |
| wa | Walloon / Walon | ~0.6 | ○ | 💡 Idea |
| nn | Norwegian Nynorsk / Norsk nynorsk | ~0.6 | ○ | 💡 Idea |
| fy | Western Frisian / Frysk | ~0.5 | ○ | 💡 Idea |
| mt | Maltese / Malti | ~0.5 | ○ | 💡 Idea |
| sm | Samoan / Gagana Sāmoa | ~0.5 | ○ | 💡 Idea |
| lb | Luxembourgish / Lëtzebuergesch | ~0.4 | ○ | 💡 Idea |
| is | Icelandic / Íslenska | ~0.36 | ○ | 💡 Idea |
| fj | Fijian / Na vosa vaka-Viti | ~0.35 | ○ | 💡 Idea |
| hz | Herero / Otsiherero | ~0.25 | ○ | 💡 Idea |
| kj | Kwanyama / Oshikwanyama | ~0.25 | ○ | 💡 Idea |
| ab | Abkhaz / Аԥсуа | ~0.24 | ○ | 💡 Idea |
| br | Breton / Brezhoneg | ~0.2 | ○ | 💡 Idea |
| nv | Navajo / Diné bizaad | ~0.2 | ○ | 💡 Idea |
| oc | Occitan / Occitan | ~0.2 | ○ | 💡 Idea |
| kv | Komi / Коми кыв | ~0.2 | ○ | 💡 Idea |
| ty | Tahitian / Reo Tahiti | ~0.185 | ○ | 💡 Idea |
| co | Corsican / Corsu | ~0.15 | ○ | 💡 Idea |
| mi | Maori / Te reo Māori | ~0.15 | ○ | 💡 Idea |
| ho | Hiri Motu / Hiri Motu | ~0.12 | ○ | 💡 Idea |
| to | Tongan / Lea faka-Tonga | ~0.1 | ○ | 💡 Idea |
| fo | Faroese / Føroyskt | ~0.07 | ○ | 💡 Idea |
| gd | Scottish Gaelic / Gàidhlig | ~0.06 | ○ | 💡 Idea |
| rm | Romansh / Rumantsch | ~0.06 | ○ | 💡 Idea |
| kl | Greenlandic / Kalaallisut | ~0.057 | ○ | 💡 Idea |
| mh | Marshallese / Kajin M̧ajeļ | ~0.055 | ○ | 💡 Idea |
| an | Aragonese / Aragonés | ~0.05 | ○ | 💡 Idea |
| ch | Chamorro / Finuʼ Chamoru | ~0.05 | ○ | 💡 Idea |
| se | Northern Sami / Davvisámegiella | ~0.025 | ○ | 💡 Idea |
| bi | Bislama / Bislama | ~0.01 | ○ | 💡 Idea |
| na | Nauruan / Dorerin Naoero | ~0.01 | ○ | 💡 Idea |
| ik | Inupiaq / Iñupiaq | ~0.003 | ○ | 💡 Idea |
| gv | Manx / Gaelg | ~0.002 | ○ | 💡 Idea |
| ia | Interlingua / Interlingua | ~0.001 | ○ | 💡 Idea |
| io | Ido / Ido | ~0.001 | ○ | 💡 Idea |
| ie | Interlingue / Interlingue | ~0.0005 | ○ | 💡 Idea |
| kw | Cornish / Kernewek | ~0.0005 | ○ | 💡 Idea |
| vo | Volapük / Volapük | ~0.0001 | ○ | 💡 Idea |
| la | Latin / Latina | ~0 | ○ | 💡 Idea |
| cu | Church Slavonic / Словѣньскъ | ~0 | ○ | 💡 Idea |

### 🟡 Medium — особые глифы, но LTR — 12 языков

| Code | Language | Носители (млн) | Приоритет | Status |
|------|----------|----------------|-----------|--------|
| zh | Chinese (Simplified) / 简体中文 | ~1300 | 🔥 | ✅ Complete |
| zh-tw | Chinese (Traditional) / 繁體中文 | ~1300 | 🔥 | ✅ Complete |
| ja | Japanese / 日本語 | ~125 | 🔥 | ✅ Complete |
| vi | Vietnamese / Tiếng Việt | ~85 | ⭐ | ⬜ Planned |
| ko | Korean / 한국어 | ~77 | ⭐ | ✅ Complete |
| ku | Kurdish / Kurdî | ~30 | ⭐ | 💡 Idea |
| za | Zhuang / Vahcuengh | ~16 | ⭐ | 💡 Idea |
| el | Greek / Ελληνικά | ~13 | ⭐ | 💡 Idea |
| hy | Armenian / Հայերեն | ~7 | ○ | 💡 Idea |
| ka | Georgian / ქართული | ~3.7 | ○ | 💡 Idea |
| cr | Cree / Nēhiyawēwin | ~0.096 | ○ | 💡 Idea |
| oj | Ojibwe / Anishinaabemowin | ~0.05 | ○ | 💡 Idea |

### 🟠 Tricky — сложные скрипты и правила переноса — 27 языков

| Code | Language | Носители (млн) | Приоритет | Status |
|------|----------|----------------|-----------|--------|
| hi | Hindi / हिन्दी | ~600 | 🔥 | 💡 Idea |
| bn | Bengali / বাংলা | ~270 | 🔥 | 💡 Idea |
| pa | Punjabi / ਪੰਜਾਬੀ | ~100 | 🔥 | 💡 Idea |
| te | Telugu / తెలుగు | ~95 | ⭐ | 💡 Idea |
| mr | Marathi / मराठी | ~95 | ⭐ | 💡 Idea |
| bh | Bihari / भोजपुरी | ~90 | ⭐ | 💡 Idea |
| ta | Tamil / தமிழ் | ~85 | ⭐ | 💡 Idea |
| gu | Gujarati / ગુજરાતી | ~62 | ⭐ | 💡 Idea |
| th | Thai / ภาษาไทย | ~60 | ⭐ | ⬜ Planned |
| am | Amharic / አማርኛ | ~57 | ⭐ | 💡 Idea |
| kn | Kannada / ಕನ್ನಡ | ~44 | ⭐ | 💡 Idea |
| or | Odia / ଓଡ଼ିଆ | ~38 | ⭐ | 💡 Idea |
| ml | Malayalam / മലയാളം | ~35 | ⭐ | 💡 Idea |
| my | Burmese / မြန်မာ | ~33 | ⭐ | 💡 Idea |
| ne | Nepali / नेपाली | ~30 | ⭐ | 💡 Idea |
| as | Assamese / অসমীয়া | ~25 | ⭐ | 💡 Idea |
| km | Khmer / ខ្មែរ | ~17 | ⭐ | 💡 Idea |
| si | Sinhala / සිංහල | ~17 | ⭐ | 💡 Idea |
| ti | Tigrinya / ትግርኛ | ~9 | ○ | 💡 Idea |
| lo | Lao / ລາວ | ~7 | ○ | 💡 Idea |
| bo | Tibetan / བོད་སྐད | ~6 | ○ | 💡 Idea |
| ii | Nuosu / ꆈꌠꉙ | ~2 | ○ | 💡 Idea |
| dz | Dzongkha / རྫོང་ཁ | ~0.6 | ○ | 💡 Idea |
| iu | Inuktitut / ᐃᓄᒃᑎᑐᑦ | ~0.04 | ○ | 💡 Idea |
| sa | Sanskrit / संस्कृतम् | ~0.03 | ○ | 💡 Idea |
| pi | Pali / पालि | ~0 | ○ | 💡 Idea |
| ae | Avestan / 𐬀𐬬𐬈𐬯𐬙𐬀 | ~0 | ○ | 💡 Idea |

### 🔴 RTL — справа налево (нужна зеркальная вёрстка) — 10 языков

| Code | Language | Носители (млн) | Приоритет | Status |
|------|----------|----------------|-----------|--------|
| ar | Arabic / العربية | ~420 | 🔥 | ⬜ Planned |
| ur | Urdu / اردو | ~230 | 🔥 | 💡 Idea |
| fa | Persian / فارسی | ~90 | ⭐ | 💡 Idea |
| ps | Pashto / پښتو | ~50 | ⭐ | 💡 Idea |
| sd | Sindhi / سنڌي | ~30 | ⭐ | 💡 Idea |
| ug | Uyghur / ئۇيغۇرچە | ~10 | ⭐ | 💡 Idea |
| he | Hebrew / עברית | ~9 | ○ | ⬜ Planned |
| ks | Kashmiri / कॉशुर | ~7 | ○ | 💡 Idea |
| dv | Divehi / ދިވެހި | ~0.7 | ○ | 💡 Idea |
| yi | Yiddish / ייִדיש | ~0.6 | ○ | 💡 Idea |

### Заметки по сложности

- **🟢 Simple (138)** — «европейская армия»: латиница/кириллица, LTR. Добавляются одним и тем же скриптом без отладки UI — таблица переводов готова, и UI не требует правок. «Музейные» языки (мёртвые: la, sa, pi, ae, cu; искусственные: eo, io, ia, ie, vo) добавлены для полноты покрытия 639-1 — их перевод не планируется.
- **🟡 Medium (12)** — CJK-языки (zh/zh-tw/ja/ko) уже готовы: короткие строки, но другая геометрия символов. Вьетнамский — латиница с плотной диакритикой, курдский — две письменности (латиница и арабская вязь).
- **🟠 Tricky (27)** — тайский и лаосский пишутся без пробелов между словами (переносы и обрезка строк ведут себя неожиданно), индийские скрипты (деванагари, гуджарати, бенгали, тамильский…) — сложная вязь и лигатуры, эфиопский и тибетский — особые системы письма.
- **🔴 RTL (10)** — арабский, иврит, идиш, персидский, урду, пушту, синдхи, уйгурский, кашмирский, дивехи требуют зеркальной вёрстки: `dir="rtl"` на корне, реверс флексов, отступов, иконок-стрелок и тултипов. Перед включением нужен прогон на реальном UI.

---

## 🏴‍☠️ Fan / Novelty Languages — Фан-языки

Все фан-локализации — LTR, 🟢 Simple по вёрстке (основа — английская; для `ru-*` — русская). Добавляются **по одной**: пачка стирает уникальность характера каждого, поэтому каждый язык — отдельный генератор со своим голосом. Сейчас **33 фан-локализации**: 7 готово + 26 идей.

### 🇺🇸 Акценты и диалекты

| Code | Name | Inspiration | Status |
|------|------|-------------|--------|
| en-nyc | New York 🗽 | Brooklyn / New York accent | ✅ Complete |
| en-aussie | Straya 🦘 | Australian / Outback slang | 💡 Idea |
| en-scot | Scottish 🏴󠁧󠁢󠁳󠁣󠁴󠁿 | Scottish dialect | 💡 Idea |
| en-valley | Valley Girl 💅 | 80s Valley Girl / Like, totally | 💡 Idea |
| en-cockney | Cockney 🫖 | London Cockney / rhyming slang, dropped H's | 💡 Idea |
| en-texan | Texan 🤠 | Southern drawl / Howdy, y'all | ✅ Complete |
| en-canadian | Canadian 🍁 | Canadian / Eh? / Aboot | 💡 Idea |
| en-irish | Irish ☘️ | Irish English / Grand, craic | 💡 Idea |
| en-jamaican | Jamaican 🇯🇲 | Jamaican Patois / Irie, mon | 💡 Idea |

### 🎭 Персонажи и фандомы

| Code | Name | Inspiration | Status |
|------|------|-------------|--------|
| en-pirate | Pirate ☠️ | Pirates of the Caribbean style | ✅ Complete |
| en-anime | Anime English ✿ | Anime / Otaku / Japanese loanwords | ✅ Complete |
| en-uwu | UwU | Cute / Kawaii / Furry speak | ✅ Complete |
| en-caveman | Caveman 🦴 | Caveman / Unga Bunga | ✅ Complete |
| en-old | Old English 🏰 | Shakespearean / Thou speak | ✅ Complete |
| en-yoda | Yoda Speak 🌿 | Star Wars / Yoda grammar | 💡 Idea |
| en-robot | Robot 🤖 | Robotic / Binary influenced | 💡 Idea |
| en-doge | Doge 🐕 | Doge meme / Such torrent, very seed, wow | 💡 Idea |
| en-minion | Minion 🍌 | Minion speak / Banana, ka-ba-nah | 💡 Idea |
| en-shrek | Shrek 🧅 | Shrek / Swamp speak | 💡 Idea |
| en-klingon | Klingon 🖖 | Star Trek Klingon / Qapla'! | 💡 Idea |
| en-norse | Viking 🪓 | Old Norse / Valhalla awaits | 💡 Idea |
| en-samurai | Samurai 🗡️ | Bushido / Honorifics | 💡 Idea |
| en-vampire | Vampire 🧛 | Vampire / I vant to suck… | 💡 Idea |
| en-goblin | Goblin 🧌 | Goblin mode / Chaos gremlin | 💡 Idea |

### 🤖 Техно и мемы

| Code | Name | Inspiration | Status |
|------|------|-------------|--------|
| en-leet | 1337 | Leet / Hacker speak | 💡 Idea |
| en-dad | Dad Jokes 👨 | Hi {name}, I'm AsuTorrent! | 💡 Idea |
| en-soviet | Soviet ☭ | In Soviet Russia, torrent downloads YOU | 💡 Idea |
| en-royal | Royal 👑 | Queen's English / One does not simply… | 💡 Idea |
| en-binary | Binary 💾 | 01001110… (joke, unusable) | 💡 Idea |

### 🇷🇺 Русскоязычные

| Code | Name | Inspiration | Status |
|------|------|-------------|--------|
| ru-cyka | Русский Блатняк 🎸 | Russian criminal / blatnoy slang | 💡 Idea |
| ru-padonki | Олбанский 🐻 | Падонковский язык / превед, кросавчег | 💡 Idea |

### 🏝️ Островные

| Code | Name | Inspiration | Status |
|------|------|-------------|--------|
| en-pitkern | Pitkern / Norfuk 🏝️ | Pitcairn–Norfolk English creole (ISO 639-3: pih) | 💡 Idea |

---

## 🧮 Техническая справка

- Движок: `src/hooks/useLocales.ts` (тип `LocaleCode`, список `LOCALES`, карта данных).
- Файлы локалей: `src/locales/<code>.ts`, каждый экспортирует `export const data: LocaleData` (сейчас **388 ключей**, полный паритет проверяется скриптом сверки).
- Fallback: отсутствующий ключ подставляется из английского (`en.ts`), так что частичный перевод UI не ломает.
- Список локалей в пикере языка рендерится из `LOCALES` — после регистрации нового кода он появляется в UI автоматически.
- Для RTL-языков (`ar`, `he`, `yi`, `fa`, `ur`, `ps`, `sd`, `ug`, `ks`, `dv`) потребуется дополнительный шаг: переключение `document.documentElement.dir = "rtl"` при выборе локали + аудит CSS.

## 📊 Сводка по группам

| Группа | Языков | Готово | В плане | Идеи |
|--------|--------|--------|---------|------|
| 🟢 Simple | 138 | 15 | 5 | 118 |
| 🟡 Medium | 12 | 4 | 1 | 7 |
| 🟠 Tricky | 27 | 0 | 1 | 26 |
| 🔴 RTL | 10 | 0 | 2 | 8 |
| **Итого** | **187** | **19** | **9** | **159** |
