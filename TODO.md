# AsuTorrent — Roadmap & TODO

> **Legend**: ✅ Done | 🚧 In progress | ⬜ Planned | 💡 Idea | ❌ Declined

---

## ✅ v1.0 — Released

### Управление торрентами

- [x] Добавление по magnet-ссылке, info-hash (автодетект 40 hex / 32 base32), .torrent файлу, HTTP/FTP
- [x] Drag & Drop .torrent / magnet ссылок в окно (с визуальным оверлеем)
- [x] Контекстное меню (правый клик): пауза, возобновление, удалить, force re-check
- [x] Приоритеты файлов внутри торрента (дерево с чекбоксами)
- [x] Multiple selection: Ctrl+click toggle, Shift+click range, массовые операции
- [x] Подтверждение удаления: только торрент или с файлами
- [x] Последовательная загрузка (Sequential Download) для стриминга
- [x] Force Resume / Force Start (флаг `forced` exempt от очереди)
- [x] Лимиты скорости: глобальные DL/UL, Normal и Turtle режимы
- [x] Turtle Mode — переключение на альтернативные лимиты скорости
- [x] Re-check — принудительная проверка целостности торрента

### Очередь и планирование

- [x] Очередь загрузок: `QueueConfig` (max_active_downloads, max_active_seeds)
- [x] Планировщик скорости по времени (ScheduleRule: дни/часы/лимиты)
- [x] Auto-management: ratio / seed time limits, перемещение завершённых

### Категории, теги и поиск

- [x] Категории и теги с группировкой и авто-присвоением
- [x] Настройка путей загрузки: глобальный + per-category
- [x] Глобальный поиск по именам торрентов, тегам, info-hash, трекерам
- [x] Портфельный режим (Portfolios) — фильтрация по условиям

### RSS

- [x] RSS Reader: добавление лент, просмотр релизов
- [x] RSS Auto-Download: regex фильтры, quality, размер, маппинг на категории

### Внешняя интеграция

- [x] Web API — REST API с паритетом qBittorrent API (axum на 127.0.0.1:8080)
- [x] Встроенный Web UI (статика через ServeDir, доступен на `http://localhost:8080`)
- [x] Встроенный поиск по трекерам: Nyaa.si, ThePirateBay, EZTV, YTS, LinuxTracker + Jackett
- [x] Системный трей с иконкой активности
- [x] Уведомления ОС (завершение загрузки, ошибки)
- [x] Сохранение сессии (librqbit persistence) — восстановление торрентов при перезапуске

### Сеть и протоколы

- [x] SOCKS5 прокси с тестом соединения
- [x] Привязка к сетевому интерфейсу (выбор адаптера/IP)
- [x] uTP: включение/отключение per-torrent и глобально
- [x] DHT / PEX / LPD: per-torrent настройка
- [x] Encryption mode: Forced / Enabled / Disabled
- [x] Bound network interface (защита от утечки IP через VPN)
- [x] Content Security Policy в Tauri

### UI / UX

- [x] Колонки: Name, Size, Progress, Speed, Peers, ETA — с сортировкой
- [x] Кастомизация колонок: показать/скрыть, перетаскивание
- [x] Светлая и тёмная темы с переключением
- [x] Анимации и микро-взаимодействия (progress bars, переходы)
- [x] Статистика сессии: всего скачано/отдано, uptime, активность пиров
- [x] Экран «О приложении»: версия, зависимости, лицензия
- [x] История торрентов (что скачано/удалено, даты)
- [x] Экспорт/импорт списка торрентов (JSON/CSV)
- [x] Создание .torrent файлов из локальных папок/файлов
- [x] Проверка и авто-обновление приложения
- [x] Потоковое воспроизведение видео (HTTP Range-запросы через librqbit)
- [x] Назначение AsuTorrent клиентом по умолчанию для magnet-ссылок

### Дашборды и мониторинг

- [x] Карта пиров (гео-распределение)
- [x] Графики скорости (download/upload за час/день/неделю)
- [x] P2P трафик по странам
- [x] Prometheus метрики (`/metrics`)

### Инфраструктура

- [x] GitHub CI: cargo check, tsc --noEmit, линтеры
- [x] GitHub Actions: сборка .msi, .dmg, .deb/.rpm/AppImage
- [x] Подписание билдов (macOS + Windows)
- [x] Авто-релизы по тегу
- [x] Docker образ для headless запуска
- [x] Unit-тесты Rust + Preact
- [x] StateMachine для торрентов (конечный автомат переходов)
- [x] Graceful error state + ErrorBoundary + лог ошибок
- [x] Защита от SSRF через magnet link
- [x] Авто-блокировка известных плохих IP (blocklist_url)
- [x] Runtime-проверка имён полей JSON (build_clean_payload)

---

## 🚀 v1.1+ — Next Release

### Новые фичи

- [x] 📂 **Watch Folder** — папка для авто-добавления .torrent файлов (как в qBitTorrent)
- [x] 🔄 **Super-seeding** — режим первой раздачи (каждый кусок отправляется только одному пиру)
- [ ] 🎨 **Метки и цвета** — визуальная маркировка торрентов цветными ярлыками
- [ ] 📏 **Per-torrent лимиты скорости** — индивидуальные DL/UL лимиты для каждого торрента
- [ ] 📋 **Clipboard мониторинг** — авто-детект magnet-ссылок в буфере обмена
- [ ] 🧩 **Auto-extract** — автоматическая распаковка zip/rar/7z после завершения загрузки
- [ ] ⚙️ **Run external program** — выполнение скрипта/команды при завершении торрента
- [ ] 🔀 **Auto-rename** — переименование скачанных файлов по правилам (например, `S01E01.mkv` → `Название S01E01.mkv`)
- [ ] 🗂️ **Merge trackers** — объединение трекеров из торрентов с одинаковым контентом
- [ ] 📶 **UPnP / NAT-PMP** — автоматический проброс портов
- [ ] ⛔ **Anonymous mode** — per-torrent или глобальное отключение DHT/PEX/LPD
- [ ] 🔄 **IPv6 управление** — мониторинг и контроль IPv6 пиров
- [ ] 🧹 **Duplicate detection** — обнаружение дубликатов (по info-hash / содержимому)
- [ ] 📝 **Batch operations** — массовое назначение категорий/тегов/лимитов
- [ ] 📊 **Torrent health** — индикатор здоровья (количество сидов/пиров, age, availability)

### Улучшения сети

- [ ] 🌐 **Smart Geo-Routing** — авто-выбор ближайших трекеров/пиров по latency
- [ ] 📡 **Встроенный tracker** — запуск собственного BitTorrent трекера
- [ ] 🔔 **Webhook уведомления** — POST-запросы на URL при событиях (download complete, error и т.д.)
- [ ] 🗓️ **Schedule seeding hours** — ограничение времени раздачи per-torrent
- [ ] ⏸️ **Auto-stop seeding** — остановка раздачи при отсутствии пиров
- [ ] 📋 **Blocklist auto-update** — автоматическое обновление блоклистов из URL
- [ ] 🔀 **Alternative listen port** — несколько портов для разных интерфейсов

### UI / UX улучшения

- [ ] 🔄 **Manual queue reorder** — перетаскивание торрентов в очереди
- [ ] 🌓 **Auto theme switch** — автоматическое переключение темы по времени суток
- [ ] 📁 **File preview on add** — предпросмотр содержимого .torrent до добавления
- [ ] 💾 **Torrent backup/restore** — экспорт полного состояния (.dat) с возможностью восстановления
- [ ] 🌐 **Custom Web UI themes** — сторонние темы для Web UI
- [ ] 📉 **Speed graph by day** — график скорости за день/неделю/месяц (расширенный)

---

## 🌐 Localization

Полный трекер локализаций вынесен в отдельный файл — там же таблица языков с оценкой **сложности вёрстки**:

→ **TODO_LOCALES.md**

Краткая сводка:
- **187 позиций в трекере** — все **184 кода ISO 639-1** + 3 локальных варианта (en-gb, pt-br, zh-tw), с оценкой носителей и сложностью вёрстки: **19 готово** (388 ключей каждый) + 6 фан-языков = 25 файлов локали; 9 в плане, 159 идей.
- **Вёрстка** (главный разделитель — направление письма и скрипт): 138 языков 🟢 Simple (LTR, как английский — добавляются без отладки UI); 12 🟡 (CJK, греческий, армянский…); 27 🟠 (тайский, индийские скрипты, эфиопский…); **10 🔴 RTL** (арабский, иврит, идиш, персидский, урду, пушту…) — требуют зеркальной вёрстки и проверки на реальном UI.
- **Фан-языки**: 6 готовы (pirate, anime, uwu, caveman, old, nyc), **26 идей** (акценты: cockney, texan, canadian…; персонажи: doge, minion, shrek, klingon…; техно-мемы: leet, dad, soviet…; русскоязычные: ru-cyka, ru-padonki; островные: pitkern). Добавляются по одному — пачка стирает уникальность характера каждого.

---

## 🛠 Technical Debt & Infrastructure

### Код

- [ ] 🚧 Разделить `torrent_mgr.rs` на слои — `engine.rs` (чистый librqbit) → `manager.rs` (логика) → `commands.rs` (IPC)
- [ ] 🚧 E2E тесты — Tauri драйвер, интеграционные тесты UI
- [ ] 📝 Performance benchmarks — тесты скорости для больших раздач (>1000 торрентов)
- [ ] 📝 Memory profiling — оптимизация потребления памяти для торрент-листа
- [ ] 📝 Error recovery — авто-восстановление после падения движка
- [ ] 📝 Logging system — levels, rotation, file export
- [ ] 📝 Config file watch — авто-перезагрузка конфига при изменении на диске
- [ ] 📝 Plugin system — архитектура для сторонних плагинов (API)

### Сборка и CI/CD

- [x] GitHub CI: cargo check, tsc, тесты
- [x] GitHub Actions: сборка под все платформы
- [x] Авто-релизы по тегу
- [x] Docker образ для headless
- [ ] 📝 Code signing для Windows (EV cert)
- [ ] 📝 macOS notarization
- [ ] 📝 Flatpak / Snap пакеты для Linux
- [ ] 📝 Авто-обновление через Tauri updater

---

## 🗺️ Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| v1.0 | Core features, все базовые возможности торрент-клиента | ✅ Released |
| v1.1 | Продвинутые фичи: watch folder, super-seeding, метки, auto-extract, UPnP, webhooks | 🚧 Next |
| v1.2 | i18n expansion (IT, PT, AR, TR и другие), фан-локализации | ⬜ Planned |
| v1.5 | Killer features: media organizer, DHT search, IPFS, Seedbox-to-Home | 💡 Long-term |

---

## ❌ Declined

Фичи, которые были рассмотрены, но отклонены по прагматическим соображениям.

- **AI-детектор подозрительных торрентов** — on-device ML даёт ложные срабатывания. Фейковые раздачи проще отсеивать по reputability трекеров.
- **Интеллектуальные RSS фильтры** (семантический поиск) — regex + категории + размер решают 99% задач.
- **Анонимный чат пиров** — нишевая фича с высокими затратами. Нет подтверждённого спроса.
- **Нативная поддержка blockchain-торрентов** — слишком сырая экосистема, нет стандартов.
- **Встроенный VPN** — юридические риски, сложность поддержки, лучше использовать внешние решения.

---

## 📦 Зависимости

| Feature | Crate / Library | Status |
|---------|----------------|--------|
| RSS парсинг | `rss`, `reqwest` | ✅ |
| Видео плеер | HTML5 + Range requests (librqbit) | ✅ |
| Icons | Preact + CSS | ✅ |
| i18n | Hand-written locale objects | ✅ |
| Графики | SVG + CSS | ✅ |
| Гео-карта | Leaflet.js + maxminddb (Rust) | ✅ |
| IPFS | `ipfs-api` (Rust) | ⬜ |
| E2E тесты | `@tauri-apps/test` / WebDriver | 🚧 |
