# Telegram Delivery And Project Context Bot Architecture

Date: 2026-07-20
Task: PZK-020

## Phase 1 Implemented Shape

- Public contact capture remains the primary gate for preliminary КП and project examples.
- Backend creates one `telegram_deliveries` row together with a new calculation/proposal or project-example request.
- If `TELEGRAM_BOT_TOKEN`, a valid `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` are configured, the row starts as `pending_start` and public responses include only a `t.me/<bot>?start=<bindToken>` deep link.
- If Telegram env is missing or incomplete, the row starts as `disabled`; lead/proposal/example creation still succeeds and ordinary tokenized web links remain available.
- The authenticated private-chat Telegram `/start <bindToken>` webhook stores the Telegram chat/user metadata when available, sends tokenized document links, and records `sent`, `failed`, or `disabled` in the same row.
- The opaque Telegram bind token is not exposed in admin API responses. Telegram bot token, webhook secret, and internal chat IDs are never returned to frontend responses.

## Phase 2 Foundation

The current `telegram_deliveries` model deliberately captures the first durable primitives needed for future project-context work:

- relation to a business record (`Calculation` or `ProjectExampleRequest`);
- Telegram chat/user identifiers after explicit `/start`;
- status history for delivery success/failure;
- expiry-aware opaque bind token rather than proposal/example public tokens;
- clear separation between document delivery and internal lead notifications.

Future project groups should build on this by adding a separate project-context model rather than overloading delivery attempts. A likely next model is:

- `TelegramProjectThread`: project/calculation relation, Telegram group chat id/title, consent fields, bot permission state, status, last synced message id/date;
- `TelegramProjectMessage`: thread relation, Telegram message id, sender metadata, message type, text/file metadata/transcript pointer, received date;
- `TechnicalAssignmentDraftUpdate`: thread/project relation, daily summary sections, confidence/contradictions/open questions, admin review status.

## Explicit Limitations

- PZK-020 does not create or configure Telegram webhooks in production infrastructure.
- PZK-020 does not listen to project group message streams beyond private `/start` delivery binding.
- PZK-020 does not download files, transcribe voice, or generate daily AI summaries.
- PZK-020 does not automatically change the final technical assignment.

These parts should continue in a follow-up task after the admin workspace has a stable project record surface for reviewing proposed ТЗ updates.
