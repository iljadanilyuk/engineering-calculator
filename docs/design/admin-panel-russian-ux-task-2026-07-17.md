# PZK-016 - Русификация и UX-аудит админ-панели

Дата: 2026-07-17  
Проект: инженерный калькулятор ИП Позняк  
Рабочая папка: `E:\vc\poznyak-engineering-calculator`  
Production admin: `https://admin.poznyak.by`  
Production website: `https://poznyak.by`  
Production API: `https://api.poznyak.by`

## Цель

Перевести админ-панель на русский язык и провести прикладной UX-аудит с последующей переработкой интерфейсных компонентов так, чтобы админкой было удобно пользоваться в реальных операционных задачах:

- смотреть и обрабатывать заявки;
- менять статусы лидов;
- читать исходное КП/PDF;
- видеть состав расчета;
- редактировать услуги и цены;
- готовиться к будущим функциям: карточка проекта/ТЗ, генератор договора из Word-шаблона, Telegram-группа клиента как источник уточнений.

Важно: это не задача на backend-фичи договора или Telegram-агента. Это задача на текущую админку: русский язык, удобная информационная архитектура, отсутствие лишних горизонтальных прокруток, более рабочие компоненты и состояния.

## Почему задача нужна

Пользователь вошел в production admin и подтвердил, что технически доступ работает. При этом:

- интерфейс админки написан на английском языке, а рабочий язык пользователя - русский;
- в таблицах есть горизонтальные прокрутки, которые неудобны;
- текущая админка выглядит как техническая панель, а не как рабочий инструмент для обработки клиентов;
- будущий продуктовый вектор - привязать лид, КП, ТЗ и договор в один управляемый процесс.

PZK-016 должна сделать админку удобнее уже сейчас и заложить понятную структуру для следующих задач, не реализуя их преждевременно.

## Обязательный workflow

Перед началом реализации:

1. Прочитать этот файл.
2. Прочитать `task.md`, особенно секции PZK-007, PZK-008, PZK-009, PZK-015.
3. Прочитать текущие admin files:
   - `webapp/src/pages.tsx`
   - `webapp/src/components/AuthForm.tsx`
   - `webapp/src/components/ServicesManager.tsx`
   - `webapp/src/components/LeadsManager.tsx`
   - `webapp/src/index.css`
   - `webapp/e2e/specs/*.spec.ts`
   - `webapp/tests/*.test.ts`
4. Запустить pre-task sub-agent `gpt-5.5 xhigh`, чтобы он описал риски UX/refactor русификации админки.
5. После реализации запустить review sub-agent(s) `gpt-5.5 xhigh`.
6. Не закрывать задачу, пока хотя бы один reviewer не поставит `9.5/10` или выше.
7. Внести согласованные правки.
8. Обновить `task.md`: отметить PZK-016 complete, добавить completion notes, verification notes, review log.
9. Сделать commit и push.

## Текущий стек админки

- React + Vite.
- TanStack Router.
- TanStack Query.
- shadcn-like component layer under `webapp/src/components/ui`.
- Tailwind CSS v4 style via `webapp/src/index.css`.
- Icons: Hugeicons.
- Main pages:
  - login screen;
  - services management;
  - leads mini-CRM;
  - lead detail.

Backend/API менять только если это минимально необходимо для отображения уже существующих данных. Основная задача находится в `webapp`.

## Основные проблемы текущего UI

### Язык

В интерфейсе много английского текста:

- `Login`, `Logout`, `Admin`;
- `Admin cabinet`;
- `Services management`;
- `Leads Mini-CRM`;
- `Lead detail`;
- `Services and prices`;
- `Submitted calculations`;
- `Active services`, `Public calculator`, `Archived`;
- `Active leads`, `New`, `Won`, `Spam/Test`;
- `Open`, `Refresh`, `Previous`, `Next`;
- `Notes`, `Save notes`;
- `Status saved`, `Notes saved`;
- `Open original PDF`, `Open proposal`;
- ошибки, empty states, loading states.

Нужно заменить на русский рабочий язык, не ломая accessibility labels и tests.

### Горизонтальная прокрутка

Проблемные места:

- `LeadsManager` list table: wrapper `overflow-x-auto`, table `min-w-[1120px]`;
- lead detail calculation table: wrapper `overflow-x-auto`, table `min-w-[720px]`;
- services table может быть терпимой на desktop, но на узких экранах тоже может создавать неудобный scroll.

Требование: на mobile/tablet не должно быть грубых горизонтальных таблиц. Использовать responsive patterns:

- desktop: компактная таблица или structured list;
- tablet/mobile: карточки лидов/услуг;
- в detail view: breakdown можно показывать списком строк с суммами, а не таблицей с forced min-width;
- фильтры должны переноситься нормально и не растягивать экран.

### Информационная архитектура

Сейчас админка разделена только на `Services` и `Leads`. Для текущего scope достаточно, но нужно визуально подготовить структуру под будущий workflow:

1. Заявки.
2. Услуги и цены.
3. В будущем: проекты/ТЗ.
4. В будущем: договоры.
5. В будущем: настройки.

В PZK-016 не нужно реализовывать новые backend routes. Но можно сделать навигацию и терминологию такой, чтобы она не противоречила будущим разделам.

## Scope PZK-016

### Входит

- Полная русификация текущей админки.
- Русские статусы лидов:
  - `new` -> `Новая`;
  - `contacted` -> `Связались`;
  - `in_progress` -> `В работе`;
  - `won` -> `Договорились`;
  - `lost` -> `Отказ`;
  - `spam_test` -> `Спам/тест`.
- Русские названия разделов:
  - `Заявки`;
  - `Услуги и цены`;
  - `Карточка заявки`;
  - `КП/PDF`;
  - `Внутренние заметки`.
- Форматирование:
  - `м²` вместо `m2`;
  - `BYN` или `Br` единообразно по текущему проектному решению;
  - даты в `ru-RU`;
  - суммы читаемо, с tabular numbers where useful.
- Убрать/сильно снизить горизонтальные прокрутки.
- Улучшить layout:
  - более рабочий shell;
  - понятные active states навигации;
  - метрики без декоративной перегрузки;
  - более удобные фильтры;
  - список заявок как рабочий список, а не только таблица;
  - карточка заявки с ясными блоками: клиент, расчет, КП, статус, заметки.
- Улучшить empty/loading/error states на русском.
- Сохранить доступность: labels, focus rings, aria labels.
- Обновить тесты под русский UI.
- Browser verification desktop/mobile без горизонтальной прокрутки body.

### Не входит

- Генератор договора.
- Word `.docx` template processing.
- Telegram group listener.
- AI extraction of technical assignment.
- Новые paid DigitalOcean resources.
- DNS/env/secrets changes.
- Backend schema migrations, если только не найден критичный UI-blocker.
- Изменение public website.
- Изменение calculation/domain logic.
- Изменение proposal/PDF generation logic.
- Codex plugin layer.

## Рекомендуемые UX-решения

### Shell

Сделать админку более похожей на рабочую панель:

- top bar или компактный sidebar на desktop;
- на mobile - верхняя навигация/меню без горизонтального выхода;
- показывать текущий аккаунт компактно;
- `Выйти` как вторичное действие;
- ясно подсвечивать текущий раздел.

### Заявки

Список заявок должен помогать быстро понять:

- кто оставил заявку;
- телефон;
- когда пришла;
- площадь;
- сумма;
- статус;
- есть ли КП/PDF;
- что нужно сделать дальше.

На desktop можно оставить таблицу, но только если она помещается в нормальный viewport без forced min-width. На mobile лучше карточки:

- имя + статус;
- телефон;
- дата;
- площадь/сумма;
- краткий список услуг;
- кнопки `Открыть`, `PDF`.

Фильтры:

- общий поиск;
- статус;
- период;
- отдельные поля имя/телефон можно спрятать в `Расширенные фильтры`, если они перегружают первый экран.

### Карточка заявки

Приоритет блоков:

1. Контакт клиента и быстрые действия.
2. Статус и внутренняя заметка.
3. Ссылка на КП/PDF.
4. Расчет и выбранные услуги.
5. Технические детали snapshot ниже.

Визуально отделить:

- публичные данные клиента;
- внутренние admin-only заметки;
- immutable snapshot;
- будущие placeholders для `ТЗ` и `Договор`, если они нужны как disabled/coming-soon hints.

Не делать новые backend-фичи, но можно добавить аккуратные disabled affordances, если они не выглядят как сломанные кнопки.

### Услуги и цены

Задача страницы:

- быстро понять, какие услуги активны;
- что показывается в публичном калькуляторе;
- какая цена в USD;
- какой BYN preview;
- изменить цену/описание без риска.

Рекомендации:

- `Активные`, `В калькуляторе`, `Архив` вместо английских метрик;
- заменить `Public` на `Показывать`;
- `Archive` -> `В архив`, `Restore` -> `Вернуть`;
- подтверждение архивации на русском;
- формулы/future scope объяснить человечески: `Формульные услуги пока нельзя редактировать в админке`.

### Компоненты

Пересмотреть:

- Table responsive behavior.
- Card density.
- Badge variants for statuses.
- Button hierarchy.
- Dialog copy and width.
- Select trigger widths.
- Empty states.
- Loading states.
- Error messages.

Не нужно переписывать всю UI-библиотеку. Улучшать целевые компоненты и классы там, где это решает реальные проблемы.

## Copy deck

Примерные русские тексты:

- `Вход в админ-панель`
- `Управление калькулятором`
- `Заявки`
- `Услуги и цены`
- `Карточка заявки`
- `Вы вошли как {name}`
- `Проверяем сессию...`
- `Нет доступа`
- `У этой учетной записи нет прав администратора.`
- `Войти`
- `Входим...`
- `Не удалось войти`
- `Слишком много попыток входа. Попробуйте позже.`
- `Заявки из калькулятора`
- `Показано {start}-{end} из {filtered}`
- `Обновить`
- `Сбросить`
- `Открыть`
- `Открыть PDF`
- `Открыть КП`
- `Назад к заявкам`
- `Внутренние заметки`
- `Сохранить заметки`
- `Заметки сохранены`
- `Статус сохранен`
- `Услуги и цены`
- `Добавить услугу`
- `Редактировать услугу`
- `Цена в USD`
- `Предпросмотр BYN`
- `Показывать в калькуляторе`
- `Сохранить`
- `Отмена`

Точные формулировки можно улучшать по месту, но весь UI должен быть на русском.

## Design constraints

- Админка - рабочий инструмент, а не маркетинговый сайт.
- Не делать hero/landing-style композицию.
- Избегать огромных декоративных карточек.
- Не использовать nested cards, если можно разделить блоки spacing/sections.
- Данные должны сканироваться быстро.
- Текст не должен обрезаться или налезать на соседние элементы.
- Табличные числа должны быть визуально стабильными.
- На mobile не должно быть горизонтального скролла body.
- Не добавлять лишние библиотеки без необходимости.
- Если используются icons, они должны помогать действию, а не украшать интерфейс.

## Verification

Обязательно прогнать:

```powershell
bun run typecheck
bun run --cwd webapp lint
bun run test:webapp
bun run build:webapp
bun run e2e:webapp
git diff --check
```

Добавить browser verification:

- desktop admin login -> services -> leads -> lead detail;
- mobile width около 390px:
  - login;
  - services;
  - leads list;
  - lead detail;
  - проверить, что `document.documentElement.scrollWidth <= window.innerWidth + 1` или зафиксировать исключение;
  - сделать screenshots в `.scratch` для review.

Если production API недоступен для локального e2e, использовать существующие e2e fixtures/setup.

## Acceptance criteria

PZK-016 считается завершенной, если:

- вся видимая админка на русском языке;
- текущие e2e/tests обновлены и проходят;
- список заявок и карточка заявки удобны на desktop и mobile;
- forced horizontal table scroll убран или заменен адаптивным представлением там, где он мешал;
- услуги и цены можно редактировать без потери текущей функциональности;
- статусы лидов корректно меняются;
- ссылки на original КП/PDF продолжают открываться;
- заметки сохраняются;
- публичный сайт, backend calculation, PDF generation и Telegram notification не затронуты;
- review gate пройден с оценкой `9.5/10+`;
- `task.md` обновлен;
- commit/push выполнены.

## Готовый prompt для нового окна

```text
Рабочая папка: E:\vc\poznyak-engineering-calculator

Нужно выполнить PZK-016 - Русификация и UX-аудит админ-панели.

Сначала прочитай:
- docs/design/admin-panel-russian-ux-task-2026-07-17.md
- task.md, секции PZK-007, PZK-008, PZK-009, PZK-015
- webapp/src/pages.tsx
- webapp/src/components/AuthForm.tsx
- webapp/src/components/ServicesManager.tsx
- webapp/src/components/LeadsManager.tsx
- webapp/src/index.css
- webapp/e2e/specs/*.spec.ts
- webapp/tests/*.test.ts

Обязательный workflow:
1. Перед началом запусти pre-task sub-agent `gpt-5.5 xhigh`; он должен описать UX/refactor/i18n risks.
2. Реализуй PZK-016.
3. После выполнения запусти review sub-agent(s) `gpt-5.5 xhigh`.
4. Не закрывай задачу, пока хотя бы один reviewer не поставит 9.5/10 или выше.
5. Внеси согласованные правки.
6. Обнови task.md: PZK-016 complete, completion notes, verification notes, review log.
7. Сделай commit и push.

Цель:
- перевести текущую админку на русский;
- провести UX-аудит;
- убрать неудобные горизонтальные прокрутки;
- переработать внутренние компоненты админки под реальные задачи: заявки, услуги/цены, КП/PDF, заметки;
- подготовить интерфейсную структуру для будущих задач: ТЗ, договор, Telegram-группа, но не реализовывать эти backend-фичи сейчас.

Не трогай:
- production cloud/DigitalOcean/DNS/env/secrets;
- public website;
- backend calculation/domain/PDF logic;
- Codex plugin layer.

Verification:
- bun run typecheck
- bun run --cwd webapp lint
- bun run test:webapp
- bun run build:webapp
- bun run e2e:webapp
- browser screenshots desktop/mobile, включая проверку отсутствия body horizontal scroll.
```
