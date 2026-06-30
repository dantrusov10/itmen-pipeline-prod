# AGENTS.md — контекст для разработки ITMen Pipeline

## Что это

Внутренняя CRM продаж и пре-сейла: https://itmen-pipeline.nwlvl.ru  
Репозиторий: `itmen-pipeline-prod`, ветка `master`.  
Прод: SSH `newlevel-prod`, путь `/opt/itmen-pipeline`.

## Стек

| Слой | Технология |
|------|------------|
| Frontend | Vanilla JS, `index.html` + `js/*`, `css/style.css` |
| API | Express `deploy/server/api/src/index.js` :3010 |
| DB | PocketBase :8095, ~32 коллекций |
| Sync | AmoCRM inbound poll, Kaiten presale poll |

## Ключевые правила (не ломать)

1. **Amo — только inbound.** Не пушить сделки/задачи обратно в Amo из CRM.
2. **Пре-сейл воронка Amo** не синхронизируется.
3. **Права пре-сейла:** может редактировать любую сделку (паспорт, скоринг, события, пре-сейл); смена владельца сделки — только admin или sales-owner. Все действия пишутся в ленту с `author`.
4. **«Пилот Окончен»** — только `presale` или `admin`.
5. **Перенос задачи** — обязательный комментарий (UI + API).
6. **data_epoch** — клиент шлёт `baseDataEpoch` на PATCH; сервер отвечает 409 при конфликте.
7. **Kaiten webhook** — заголовок `x-kaiten-webhook-secret` или `?secret=` = `KAITEN_WEBHOOK_SECRET`.

## Структура кода

```
js/                    — фронт (app.js — точка входа UI)
deploy/server/api/src/ — API handlers, mapper, amo-*, kaiten-*, presale-data
deploy/server/scripts/ — миграции PB, деплой, poll runners
deploy/server/pocketbase/ — COLLECTIONS.md, import JSON
```

Пре-сейл данные: коллекция `presale_deals` (v9), fallback — `pipeline_meta.slug=presale_deals`.

## Деплой

```bash
# API
scp -r deploy/server/api/src newlevel-prod:/opt/itmen-pipeline/api/
ssh newlevel-prod "systemctl restart itmen-pipeline-api"

# Frontend (или deploy-frontend.sh на сервере)
scp index.html css/style.css js/{api,app,workspaces,presale-auth,bootstrap}.js \
  newlevel-prod:/opt/itmen-pipeline/frontend/current/
```

Подробнее: `deploy/server/DEPLOY_SERVER.md`.

## Миграции схемы PB

После свежего `import-collections.py`:

```bash
bash /opt/itmen-pipeline/scripts/setup-schema-migrations.sh
```

## Env на проде (`/opt/itmen-pipeline/.env`)

- `PB_*`, `API_PORT`
- Amo tokens: `/opt/itmen-pipeline/amo-tokens.json` (не в git)
- `KAITEN_WEBHOOK_SECRET`
- `ITMEN_BUILD_ID` или `GIT_COMMIT` — для `/api/health` → `build`
- Опционально почта: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Selectel: `smtp.mail.selcloud.ru:1127`)

## Таймеры systemd

- `itmen-pipeline-amo-poll.timer`
- `itmen-pipeline-kaiten-poll.timer`
- `itmen-pipeline-snapshot.timer`, `itmen-pipeline-backup.timer`

## Cache-bust

В `index.html` версии `?v=crmNN` — bump при изменении соответствующих файлов.

## Секреты

Никогда не коммитить: `.env`, `amo-tokens.json`, пароли пользователей.
