# Публикация в Chrome Web Store

Всё, что нужно для страницы расширения в магазине. Тексты ниже можно копировать
в [Developer Dashboard](https://chrome.google.com/webstore/devconsole) как есть.

## План публикации

### 1. Подготовить архив

1. Проверить версию: `version` в `public/manifest.json` (`1.0.0`) и
   `version` в `package.json` должны совпадать.
2. Собрать архив: `npm run package` →
   `release/contributor-stats-for-shutterstock-1.0.0.zip`. Внутри то же, что в
   `dist/`: `manifest.json` в корне архива, иконки, `_locales/en` и `_locales/ru`.
3. Последняя проверка: в `chrome://extensions` загрузить распакованную `dist/`
   и один раз полностью загрузить данные. Убедиться, что нет ошибок на карточке
   расширения.

### 2. Выложить политику конфиденциальности

Файл — `store/privacy-policy.html` (английский и русский на одной странице).

## Картинки

| Файл                                | Куда                 |
| ----------------------------------- | -------------------- |
| `public/icons/shutterstock-128.png` | Store icon (128×128) |

## Store listing

**Name:** Contributor Stats for Shutterstock

**Category:** Productivity → Tools

**Language:** English (основной) и Russian (`public/_locales/ru/messages.json`).

**Русское название:** Статистика продаж для авторов Shutterstock

### Summary

EN (130):

> Sales statistics for Shutterstock contributors: earnings by file, shoot, month and license type. Not affiliated with Shutterstock.

RU (127):

> Статистика продаж для авторов Shutterstock: доход по файлам, съёмкам, месяцам и типам лицензий. Не связано с Shutterstock.

### Description — EN

```
See what every photo, video and shoot actually earns you on Shutterstock.

Shutterstock shows your earnings across daily summaries and license tabs. This extension collects all of them from your own contributor account and puts them together:

• By shoot — files grouped automatically by upload date (both photos and videos): revenue, downloads, published and sold files, revenue per file, time on sale, split by license type. Rename shoots, join multi-day uploads, or select files to group into your own shoots.
• By file — every photo, illustration and video that sold, with search, media filter and sorting by any column.
• By year/month — revenue per calendar year, plus revenue and downloads per month over your portfolio growth, including Contributor Fund and Referrals.
• By upload year — how the shoots of each upload year keep selling as they get older.
• Portfolio overview — total earnings, downloads, files sold, portfolio success, average per sold file and per portfolio file, earnings by license type.

English and Russian, light and dark theme, works on narrow screens.

Privacy: everything stays in your browser. The extension talks only to submit.shutterstock.com using your existing login, has no servers and no tracking, and never sees your password. “Delete all data” removes everything.

How to use: log in at submit.shutterstock.com as a contributor, click the extension icon, then “Load data”.

This is an independent project and is not affiliated with Shutterstock.
```

### Description — RU

```
Узнайте, сколько на самом деле приносит каждое фото, видео и съёмка на Shutterstock.

Shutterstock показывает начисления в дневных отчётах и по отдельным вкладкам лицензий. Расширение собирает их из вашего аккаунта автора и сводит вместе:

• По съёмкам — файлы автоматически группируются по дате загрузки (и фото, и видео): доход, загрузки, опубликованные и проданные файлы, доход на один файл, срок в продаже, разбивка по типам лицензий. Съёмки можно переименовывать, объединять между датами или выделять нужные файлы в свои съёмки.
• По файлам — все проданные фото, иллюстрации и видео с поиском, фильтром по типу медиа и сортировкой по любой колонке.
• По годам/месяцам — доход за каждый календарный год, а также доход и число загрузок по месяцам на фоне роста портфеля (включая «Средства автора» и «Рекомендации»).
• По годам загрузки — как продаются съёмки каждого года по мере того, как стареют.
• Общая статистика — весь доход, загрузки, проданные файлы, успешность портфеля, средний доход с проданного файла и на один файл портфеля, доход по типам лицензий.

Английский и русский язык, светлая и тёмная тема, удобно на узких экранах.

Конфиденциальность: всё остаётся в вашем браузере. Расширение обращается только к submit.shutterstock.com через ваш уже выполненный вход, у него нет серверов и отслеживания, пароль оно не видит. Кнопка «Удалить все данные» стирает всё.

Как пользоваться: войдите на submit.shutterstock.com как автор, нажмите на значок расширения, затем «Загрузить данные».

Это независимый проект, он не связан с Shutterstock.
```

## Конфиденциальность (вкладка Privacy)

### Single purpose

> Shows a Shutterstock contributor their own sales statistics — earnings by photo, video, shoot, month and license type — collected from their logged-in Shutterstock account.

### Permission justification

**storage:**

> Stores the downloaded sales statistics, incremental sync cache and the user's own settings (own shoots, renames, joined shoots) locally, so the statistics are available without downloading everything again.

**unlimitedStorage:**

> Large portfolios (thousands of files with multi-year daily sales history) can exceed the default extension storage quota. The data stays on the user's device.

**scripting:**

> The extension runs requests inside the user's open submit.shutterstock.com tab so they use the user's existing Shutterstock login, exactly like the Shutterstock website itself. No code is injected into any other site.

**Host permission `https://submit.shutterstock.com/*`:**

> submit.shutterstock.com is the only site the extension reads data from: the user's own contributor earnings, daily sales summaries and published photo/video catalog.
