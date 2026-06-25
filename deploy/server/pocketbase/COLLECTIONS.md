# Дерево коллекций ITMen Pipeline (PocketBase)

Импорт в Admin UI: **Settings → Import collections** → файл `collections.import.json`

Или на сервере: `pocketbase migrate up` (файл в `pb_migrations/`)

```
itmen_pipeline (PocketBase)
│
├── deals                    # Сделки (основная сущность)
│   ├── deal_id              text, unique     D-001, D-002…
│   ├── customer             text
│   ├── industry             text
│   ├── owner                text             фильтр по менеджеру
│   ├── stage                text
│   ├── deal_type            text
│   ├── amount               number
│   ├── expected_budget      number
│   ├── partner              text
│   ├── partner_discount     number
│   ├── client_discount      number
│   ├── manual_prob          number
│   ├── task_due             text
│   ├── budget_period        text
│   ├── budget_status        text
│   ├── budget_planned_month number
│   ├── budget_planned_year  number
│   ├── pains                editor          ключевые боли
│   ├── capabilities         text
│   ├── dml                  text
│   ├── next_step_type       text
│   ├── next_step_comment    text
│   ├── risk_type            text
│   ├── risk_types           json            массив id рисков
│   ├── risk_comment         text
│   ├── commit_status        text
│   ├── last_update          text            YYYY-MM-DD
│   ├── amo_id               number
│   ├── deal_updated_at      date            updatedAt для merge
│   ├── tech_research        json            competitorEntries, asIsStack…
│   ├── scores               json
│   ├── score_reasons        json
│   ├── score_history        json
│   ├── scores_overridden    json
│   └── payload              json            полный снимок сделки (страховка)
│
├── pipeline_meta            # Метаданные пайплайна (1 запись slug=main)
│   ├── slug                 text, unique     "main"
│   ├── next_id              number          счётчик D-xxx
│   ├── data_epoch           number          версия базы (анти-wipe)
│   ├── lists                json            справочники stages, owners…
│   └── saved_at             date
│
├── audit_log                # Аудит изменений (как лист _audit)
│   ├── at                   text            2026-06-25 09:40:58
│   ├── saved_by             text
│   ├── deal_id              text
│   ├── customer             text
│   ├── owner                text
│   ├── change_count         number
│   ├── label                text            «Скоринг», «Клиент»…
│   ├── old_value            editor
│   └── new_value            editor
│
├── snapshots_daily          # Ежедневные метрики пайплайна
│   ├── date                 text
│   ├── ts                   date
│   ├── deal_count           number
│   ├── total_pipeline       number
│   ├── weighted_pipeline    number
│   ├── hot_count            number
│   ├── warm_count           number
│   └── avg_score            number
│
└── snapshots_deals          # Срез сделок на дату
    ├── date                 text
    ├── ts                   date
    ├── deal_id              text
    ├── customer             text
    ├── owner                text
    ├── score                number
    ├── amount               number
    └── category             text
```

## Связи с текущим JSON (GAS)

| GAS / `state` | PocketBase |
|---------------|------------|
| `deals[].id` | `deals.deal_id` |
| `deals[].*` скаляры | одноимённые поля (snake_case) |
| `deals[].techResearch` | `deals.tech_research` |
| `deals[].updatedAt` | `deals.deal_updated_at` |
| `lists` + `nextId` | `pipeline_meta` (slug=main) |
| `_audit` строки | `audit_log` |
| `_snapshots_daily` | `snapshots_daily` |
| `_snapshots_deals` | `snapshots_deals` |

## Правила доступа (сейчас)

- **Чтение** `deals`, `pipeline_meta`: публичное (`listRule`/`viewRule` = `""`) — как у GAS
- **Запись**: только admin (через API token / middleware на следующем этапе)
