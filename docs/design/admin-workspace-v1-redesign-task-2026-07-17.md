# PZK-021 - Admin Workspace V1 по прототипу личного кабинета

Дата: 2026-07-17
Проект: `poznyak-engineering-calculator`
Рабочая папка: `E:\vc\poznyak-engineering-calculator`
Production admin: `https://admin.poznyak.by`

## Цель

Переработать текущую админ-панель в более цельный рабочий кабинет по направлению прототипа `poznyak-admin-prototype-v1`, но не переносить прототип буквально и не тащить в первый этап всю избыточную детализацию.

Пользователю нравится направление прототипа больше текущей админки: постоянный sidebar, рабочий стол, воронка заявок, карточка проекта, услуги/цены, будущие договоры и опросник. При этом прототип кажется шумным и перегруженным. Значит задача первого этапа: взять структуру и визуальный язык, упростить плотность и внедрить рабочие части поверх текущих данных.

## Исходные материалы

Локальный пакет прототипа:

- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1-codex-task.md`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1.html`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-dashboard.png`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-pipeline.png`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-record.png`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-questionnaire.png`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-services.png`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-contracts.png`

Предыдущая UX-задача:

- `docs/design/admin-panel-russian-ux-task-2026-07-17.md`

Текущий tracker:

- `task.md`

## Важное замечание по прототипу

Прототип не является макетом "точь-в-точь". Его нужно использовать как направление:

- да: более зрелая навигация, рабочий стол, канбан, карточка проекта, статусы, следующий шаг;
- да: спокойная рабочая эстетика, темный sidebar, светлая рабочая область, синий action color;
- да: связка `заявка -> КП -> ТЗ -> договор -> проектирование`;
- нет: переносить все KPI, все заглушки и все будущие сущности сразу;
- нет: делать экран шумным ради демонстрации;
- нет: создавать backend-модели договора, ТЗ или Telegram без отдельной задачи.

Нужен более простой, практичный V1: меньше декоративных карточек, меньше мелких бейджей, больше ясных рабочих приоритетов.

## Текущий контекст проекта

Уже есть:

- production backend/API, website и webapp на DigitalOcean;
- admin auth;
- русифицированная текущая админка после PZK-016;
- управление услугами и ценами;
- mini-CRM заявок;
- карточка заявки;
- immutable calculation snapshots;
- proposal HTML/PDF;
- token-protected proposal/example links;
- lead-gated project examples после PZK-017.

Текущая админка функциональна, но все еще ощущается как набор страниц, а не как единый рабочий кабинет.

## Scope PZK-021

### Входит

1. Инвентаризация текущей админки:
   - `webapp/src/pages.tsx`
   - `webapp/src/components/LeadsManager.tsx`
   - `webapp/src/components/ServicesManager.tsx`
   - `webapp/src/components/AuthForm.tsx`
   - `webapp/src/index.css`
   - `webapp/e2e/specs/*.spec.ts`
   - `webapp/tests/*.test.ts`

2. Новый admin shell:
   - постоянный sidebar на desktop;
   - компактная верхняя панель с поиском/созданием/профилем, если это не перегружает;
   - мобильная адаптация без body horizontal scroll;
   - понятный active state текущего раздела;
   - навигационные разделы:
     - `Рабочий стол`;
     - `Заявки и проекты`;
     - `Услуги и цены`;
     - future-disabled/placeholder: `Проекты / ТЗ`;
     - future-disabled/placeholder: `Договоры`;
     - `Настройки` или `Интеграции`, если уже есть смысл.

3. Рабочий стол V1:
   - только данные, которые помогают действовать;
   - минимум KPI;
   - список заявок/событий, требующих внимания;
   - блоки можно строить на существующих данных leads/calculations/project example requests;
   - если real task model отсутствует, показывать честный empty/placeholder: `Следующие действия появятся после задачи по задачам и напоминаниям`.

4. `Заявки и проекты`:
   - сохранить текущую функциональность списка заявок;
   - добавить более удобный режим, близкий к воронке/канбану, если это можно сделать из существующих статусов без backend-migration;
   - сохранить таблицу или список для поиска и фильтрации;
   - не создавать фиктивные persistent stages, если backend их не хранит.

5. Карточка заявки / проекта:
   - визуально приблизить к прототипу `record`;
   - сверху показать путь: `Заявка -> КП -> ТЗ -> Договор -> Проектирование`, но будущие шаги могут быть disabled/coming-soon;
   - основные блоки:
     - клиент и объект;
     - расчет и состав КП;
     - ссылки на КП/PDF;
     - внутренние заметки;
     - запросы примеров проектов, если связаны по контакту или доступны в списке;
     - future placeholders для ТЗ/договора без fake functionality.

6. Услуги и цены:
   - привести визуальный стиль к новому shell;
   - убрать лишнюю декоративность;
   - оставить текущие реальные CRUD-возможности;
   - не добавлять private/commercial rates в backend в этой задаче, если для этого нужна миграция. Можно обозначить future need отдельным note/disabled control.

7. Design system polish:
   - использовать существующий stack: React, Vite, TanStack Router/Query, Tailwind v4, shadcn-like components, Hugeicons;
   - не добавлять новые UI-библиотеки без необходимости;
   - настроить цвета/tokens под прототип:
     - navy `#081A2F`;
     - action blue `#0B5FB5`;
     - app background `#F4F6F9`;
     - surface `#FFFFFF`;
     - text `#102033`;
     - border `#DCE4EC`;
   - сохранить русский язык интерфейса;
   - не использовать emoji.

8. Responsive verification:
   - desktop `1440x900`;
   - `1280x800`;
   - tablet-ish `1024x768`;
   - mobile `390px` минимум для login/list/detail/services;
   - no incoherent overlap;
   - no body horizontal scroll, кроме осознанного внутреннего horizontal scroll для канбан-колонок на mobile.

### Не входит

- Генерация договоров из Word-шаблона.
- Backend-модели договоров.
- Импорт/парсинг Telegram-групп.
- Автоматическое обновление ТЗ по Telegram.
- Полный конструктор опросника и миграция XLSX.
- Клиентский detailed questionnaire flow.
- Изменение public website / PZK-018.
- DigitalOcean resources, DNS, env, secrets.
- Codex plugin layer.
- Переименование API enum values.

## UX-ограничения

- Админка должна быть рабочим инструментом, не лендингом.
- Не делать огромные hero-блоки.
- Не делать все элементы карточками внутри карточек.
- Не переносить шум прототипа: если блок не помогает принять решение, убрать или свернуть.
- Статусы должны отличаться цветом и текстом, но цвет не должен превращать экран в мозаику.
- Числа и суммы должны сканироваться стабильно.
- Кнопки должны соответствовать реальным действиям; future actions делать disabled или labeled `позже`, чтобы не выглядело сломанным.
- Все loading/error/empty states на русском.

## Рекомендуемый порядок реализации

1. Проверить рабочее дерево и явно отделить чужие/незавершенные файлы. Не коммитить unrelated landing/prototype files.
2. Прочитать текущие admin компоненты, routes, tests.
3. Запустить pre-task review sub-agent `gpt-5.5 xhigh`:
   - попросить описать риски внедрения admin workspace V1 по прототипу;
   - отдельно спросить про границу между UI-only и backend/schema work.
4. Сделать короткий implementation plan.
5. Реализовать shell/tokens/navigation.
6. Реализовать dashboard V1.
7. Реализовать `Заявки и проекты` и карточку заявки в новой структуре.
8. Привести `Услуги и цены` к новому стилю без потери CRUD.
9. Обновить tests/e2e под новые accessible names и responsive behavior.
10. Прогнать проверки.
11. Запустить post-task review sub-agent(s) `gpt-5.5 xhigh`.
12. Не закрывать задачу, пока хотя бы один reviewer не поставит `9.5/10` или выше.
13. Внести согласованные правки.
14. Обновить `task.md`: PZK-021 complete, completion notes, verification notes, review log.
15. Commit + push.

## Verification

Обязательно:

```powershell
bun run typecheck
bun run --cwd webapp lint
bun run test:webapp
bun run build:webapp
bun run e2e:webapp
git diff --check
```

Browser verification:

- login;
- dashboard;
- `Заявки и проекты`;
- lead/project detail;
- `Услуги и цены`;
- mobile 390px for the same critical screens;
- check `document.documentElement.scrollWidth <= window.innerWidth + 1` for normal pages;
- save screenshots under `.scratch/pzk021-*`.

If full production-like data is unavailable locally, use existing e2e fixtures and clearly document any limitation.

## Acceptance Criteria

- Admin shell visually follows the calmer version of the prototype direction.
- Interface is less noisy than the prototype and more purposeful than the current admin.
- Existing auth, services CRUD, leads list/detail, status updates, notes, proposal/PDF links continue to work.
- Dashboard gives a useful operational overview from existing data.
- Lead/project record clearly connects client, object, calculation, КП/PDF, notes, and future ТЗ/contract slots.
- No accidental backend/schema expansion beyond agreed scope.
- No public website changes.
- No DigitalOcean/DNS/env changes.
- Responsive checks pass.
- Review gate `9.5/10+` passes.
- `task.md` updated and commit pushed.

## Готовый prompt для нового окна

```text
Рабочая папка: E:\vc\poznyak-engineering-calculator

Нужно выполнить PZK-021 - Admin Workspace V1 по прототипу личного кабинета.

Сначала прочитай:
- task.md
- docs/design/admin-workspace-v1-redesign-task-2026-07-17.md
- docs/design/admin-panel-russian-ux-task-2026-07-17.md
- прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1-codex-task.md
- прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1.html
- prototype screenshots:
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-dashboard.png
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-pipeline.png
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-record.png
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-services.png
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-questionnaire.png
  - прототип/poznyak-admin-prototype-v1-package/poznyak-admin-contracts.png
- current admin code:
  - webapp/src/pages.tsx
  - webapp/src/components/LeadsManager.tsx
  - webapp/src/components/ServicesManager.tsx
  - webapp/src/components/AuthForm.tsx
  - webapp/src/index.css
  - webapp/e2e/specs/*.spec.ts
  - webapp/tests/*.test.ts

Важное направление:
прототип нравится как концепция, но он слишком шумный и избыточный. Не переносить его буквально. Сделать calmer V1: постоянный sidebar, рабочий стол, заявки/проекты, карточка проекта, услуги/цены, future slots для ТЗ/договора, но без лишней детализации и без фейковых работающих кнопок.

Обязательный workflow:
1. Проверить git status и не трогать unrelated изменения.
2. Перед началом запустить pre-task sub-agent `gpt-5.5 xhigh` по рискам admin workspace redesign.
3. Реализовать PZK-021 в `webapp` на существующих API.
4. Не менять public website, DigitalOcean, DNS, env, secrets, Codex plugin layer.
5. Не реализовывать договоры, Telegram listener и полноценный опросник в этой задаче.
6. После реализации запустить review sub-agent(s) `gpt-5.5 xhigh`.
7. Не закрывать задачу, пока хотя бы один reviewer не поставит `9.5/10` или выше.
8. Внести согласованные правки.
9. Обновить `task.md`: PZK-021 complete, notes, verification, review log.
10. Сделать commit и push.

Проверки:
- bun run typecheck
- bun run --cwd webapp lint
- bun run test:webapp
- bun run build:webapp
- bun run e2e:webapp
- git diff --check
- browser verification desktop/mobile screenshots under .scratch/pzk021-*.
```
