# Performance Manager 0.1.0 (experimental)

Мод для Firefox Nightly / Sine 2.x. Без сетевых запросов от мода, сторонних библиотек и изменений SQLite, профилей или настроек безопасности.

## Быстрый тест без установки

1. Распакуйте архив в `D:\Projects\performance-manager` (файл `performance-manager.uc.js` должен лежать непосредственно в этой папке).
2. Откройте второстепенный профиль Firefox. В `about:config` включите `devtools.chrome.enabled` (если уже включён, оставьте так).
3. Откройте консоль браузера Ctrl+Shift+J. Если поле ввода недоступно, проверьте настройку выше. Если Firefox блокирует вставку, внимательно прочитайте код и следуйте инструкции самого Firefox только для доверенного кода.
4. Выполните:

```js
Services.scriptloader.loadSubScript("file:///D:/Projects/performance-manager/performance-manager.uc.js", Services.wm.getMostRecentWindow("navigator:browser"), "UTF-8")
```

В обычном окне Firefox ищите кнопку RAM рядом с панелью инструментов. Если кнопки нет, проверьте сообщения [Performance Manager] в консоли. Это пробный запуск только для текущего окна; при перезапуске он исчезнет. Для отключения без перезапуска:

```js
Services.wm.getMostRecentWindow("navigator:browser").__sinePerformanceManager?.destroy()
```

## Установка через Sine

Поместите `theme.json`, `preferences.json`, `performance-manager.uc.js` и `README.md` в корень собственного репозитория GitHub. В Sine Mods добавьте неопубликованный мод по `owner/repository`. Если Sine требует разрешения JavaScript для неопубликованных модов, предоставляйте его только для проверенного собственного репозитория; не устанавливайте другие непроверенные JS-моды. Перезапустите Firefox. Пакет не опубликован и установка ZIP напрямую через Sine не подтверждена.

В случае удаления мода перезапустите Firefox. Настройки находятся в `about:config` под префиксом `sine.performance-manager.`; они могут сохраняться после удаления. Мод не меняет настройки Firefox вне этого префикса.

## Настройки

- `enabled` (boolean, false): автоматическая выгрузка (раз в минуту, максимум 3 вкладки за проход на окно).
- `minutes` (string, "15"): возраст неактивности, 3–120 минут.
- `game` (boolean, false): ручной режим с таймаутом 3 минуты; не включает автоочистку сам по себе и не обнаруживает игры.
- `allow-only` (boolean, true): только явно разрешённые домены.
- `allowed` (string, "youtube.com"): список доменов через запятую.
- `exclusions` (string): исключения, включая рабочие сайты, почту и localhost; дополните своими доменами.
- `monitor` (boolean, false): обновление показания памяти раз в минуту. Иначе оно измеряется при открытии меню и по кнопке.

Кнопка ручной выгрузки применяет те же ограничения, максимум 8 вкладок, не требует включения автоматического режима. Активная вкладка, закреплённые, скрытые, выделенные, приватные, уже выгруженные, загружающиеся, звучащие, PiP и обнаруженные WebRTC вкладки пропускаются. Перед выгрузкой выполняется штатное сохранение состояния и проверка повторно; принудительная выгрузка не используется. Сайты без beforeunload могут потерять несохранённые данные, а беззвучное видео может быть выгружено. Не расширяйте allowlist на редакторы и важные веб-приложения без проверки. При недоступности необходимых API выгрузка не производится. RAM — сумма памяти процессов Firefox, а не точное количество уникальной физической памяти. Освобождение памяти не гарантирует конкретного объёма экономии.

## Проверка

`node --check performance-manager.uc.js` и `node --test test.cjs`. 8 тестов логики пройдены; запуск в реальном Firefox/Sine не выполнялся. API внутренние и могут меняться в Nightly. Не используйте одновременно с другой автоматической выгрузкой по таймеру, например Auto Tab Discard.

Источники API: https://firefox-source-docs.mozilla.org/browser/components/tabbrowser/docs/api.html ; https://github.com/mozilla-firefox/firefox/blob/main/browser/components/tabbrowser/TabUnloader.sys.mjs ; https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/aboutmemory/content/aboutMemory.js ; https://github.com/CosmoCreeper/Sine/wiki/Preferences .
