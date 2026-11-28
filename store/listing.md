# Публикация в Chrome Web Store

Всё, что нужно для страницы расширения в магазине. Тексты ниже можно копировать
в [Developer Dashboard](https://chrome.google.com/webstore/devconsole) как есть.

## План публикации

### 1. Подготовить архив

1. Проверить версию: `version` в `public/manifest.json` (`1.0.1`) и
   `version` в `package.json` должны совпадать.
2. Собрать архив: `npm run package` →
   `release/microstock-statistics-1.0.1.zip`. Внутри то же, что в
   `dist/`: `manifest.json` в корне архива, иконки, `_locales/en` и `_locales/ru`.
3. Последняя проверка: в `chrome://extensions` загрузить распакованную `dist/`
   и полностью загрузить данные по стокам. Убедиться, что нет ошибок на карточке
   расширения.

### 2. Выложить политику конфиденциальности

Файл — `store/privacy-policy.html` (английский и русский на одной странице).
Выложить на публичный URL (например, GitHub Pages) и указать ссылку в Developer Dashboard.

## Картинки

| Файл                              | Куда                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `public/icons/microstock-128.png` | Store icon (128×128)                                            |
| `store/promo-small-440x280.png`   | Small promo tile (440×280) — обновить под Microstock Statistics |
| `store/screenshots/*.png`         | Screenshots EN (1280×800, до 5 шт.) — обновить под новый UI     |
| `store/screenshots/ru/*.png`      | Screenshots RU (1280×800, до 5 шт.) — обновить под новый UI     |

## Store listing

**Name:** Microstock Statistics

**Category:** Productivity → Tools

**Language:** English (основной) и Russian (`public/_locales/ru/messages.json`).

**Русское название:** Статистика по микростокам

### Summary

EN (129):

> Sales stats for microstock contributors: earnings by file, shoot, month and license across Shutterstock, Adobe Stock, and iStock.

RU (125):

> Статистика продаж для авторов микростоков (Shutterstock, Adobe Stock, iStock): доход по файлам, съёмкам, месяцам и лицензиям.

### Description — EN

```
See what every photo, illustration, vector, video and shoot actually earns you across Shutterstock, Adobe Stock and iStock.

Microstock portals split your earnings across daily reports, monthly statements and separate license tabs. This extension collects all of them from your own contributor accounts and brings them together in one place:

• All stocks together — combined overview across Shutterstock, Adobe Stock and iStock, plus automatic matching of identical files between agencies (with manual link/unlink).
• By shoot — files grouped automatically by upload date (photos and videos): revenue, downloads, published and sold files, revenue per file, time on sale, split by license type. Rename shoots, join multi-day uploads, or select files to group into your own shoots.
• By file — every photo, illustration, vector and video that sold, with search, media filter and sorting by any column.
• By year/month — revenue per calendar year, plus revenue and downloads per month over your portfolio growth, including Contributor Fund, Referrals and Firefly bonuses.
• By upload year — how the shoots of each upload year keep selling as they get older.
• Portfolio overview — total earnings, downloads, files sold, portfolio success, average per sold file and per portfolio file, earnings by license type.

English and Russian, light and dark theme, works on narrow screens.

Privacy: everything stays in your browser. The extension talks only to the official contributor portals using your existing login, has no servers and no tracking, and never sees your password. “Delete all data” removes everything.

How to use: log in to your contributor account(s) (submit.shutterstock.com, contributor.stock.adobe.com, esp.gettyimages.com & accountmanagement.gettyimages.com), click the extension icon, open a stock tab and click “Load data”.

This is an independent project and is not affiliated with Shutterstock, Adobe Stock, or iStock / Getty Images.
```

### Description — RU

```
Узнайте, сколько на самом деле приносит каждое фото, иллюстрация, вектор, видео и съёмка на Shutterstock, Adobe Stock и iStock.

Стоки показывают начисления в разрозненных отчётах, месячных выписках и отдельных вкладках лицензий. Расширение собирает их из ваших аккаунтов автора и сводит вместе:

• Все стоки вместе — общая статистика по Shutterstock, Adobe Stock и iStock, а также автоматическое сопоставление одинаковых файлов между стоками (с ручной привязкой и отвязкой).
• По съёмкам — файлы автоматически группируются по дате загрузки (и фото, и видео): доход, загрузки, опубликованные и проданные файлы, доход на один файл, срок в продаже, разбивка по типам лицензий. Съёмки можно переименовывать, объединять между датами или выделять нужные файлы в свои съёмки.
• По файлам — все проданные фото, иллюстрации, векторы и видео с поиском, фильтром по типу медиа и сортировкой по любой колонке.
• По годам/месяцам — доход за каждый календарный год, а также доход и число загрузок по месяцам на фоне роста портфеля (включая «Средства автора», «Рекомендации» и бонусы Firefly).
• По годам загрузки — как продаются съёмки каждого года по мере того, как стареют.
• Общая статистика — весь доход, загрузки, проданные файлы, успешность портфеля, средний доход с проданного файла и на один файл портфеля, доход по типам лицензий.

Английский и русский язык, светлая и тёмная тема, удобно на узких экранах.

Конфиденциальность: всё остаётся в вашем браузере. Расширение обращается только к официальным порталам авторов через ваш уже выполненный вход, у него нет серверов и отслеживания, пароль оно не видит. Кнопка «Удалить все данные» стирает всё.

Как пользоваться: войдите в нужные аккаунты автора (submit.shutterstock.com, contributor.stock.adobe.com, esp.gettyimages.com и accountmanagement.gettyimages.com), нажмите на значок расширения, выберите вкладку стока и нажмите «Загрузить данные».

Это независимый проект, он не связан с Shutterstock, Adobe Stock и iStock / Getty Images.
```

## Конфиденциальность (вкладка Privacy)

### Single purpose

> Shows microstock contributors their own sales statistics — earnings by photo, video, shoot, month and license type — collected from their logged-in Shutterstock, Adobe Stock and iStock (Getty Images) contributor accounts.

### Permission justification

**storage:**

> Stores the downloaded sales statistics, portfolio metadata, incremental sync cache, cross-stock file matches and the user's own settings (own shoots, renames, joined shoots, theme, language) locally, so the statistics are available without downloading everything again.

**unlimitedStorage:**

> Large portfolios across multiple agencies (thousands of files with multi-year sales history) can exceed the default extension storage quota. All data stays locally on the user's device.

**scripting:**

> The extension executes read-only data requests inside the user's already open contributor portal tabs (`submit.shutterstock.com`, `contributor.stock.adobe.com`, `esp.gettyimages.com`, `accountmanagement.gettyimages.com`) so they use the user's existing login session, exactly like the portals themselves. No code is injected into any other site.

**Host permissions:**

- `https://*.shutterstock.com/*` — reads the user's own Shutterstock contributor earnings, daily sales summaries and published portfolio from `submit.shutterstock.com`.
- `https://*.picdn.net/*` — loads Shutterstock asset thumbnail images for display in the dashboard and local visual matching of identical files across stocks.
- `https://contributor.stock.adobe.com/*` and `https://stock.adobe.com/*` — reads the user's own Adobe Stock contributor portfolio, sales history and Firefly bonuses.
- `https://*.ftcdn.net/*` — loads Adobe Stock asset thumbnail images for display in the dashboard and local visual matching of identical files across stocks.
- `https://*.gettyimages.com/*` and `https://*.istockphoto.com/*` — reads the user's own iStock / Getty contributor royalty statements, downloads and portfolio metadata from `esp.gettyimages.com` and `accountmanagement.gettyimages.com`, and loads asset thumbnails for display and cross-stock visual matching.
