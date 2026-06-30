# Схема v3 — нормализованные сущности (без JSON)

Реестр вендоров/продуктов (`globalCatalog`) — **не в PocketBase**, файл `js/architecture-data.js` на фронте.  
На сделке: `catalog_key`, `vendor`, `product` — атрибуты выбора из реестра.

## Дерево

```
pipeline_meta              slug=main, next_id, data_epoch, focus_*
list_items                 list_key + value (справочники)
scoring_criteria           критерии скоринга + рубрики s5…s0
managers                   менеджеры

deals                      карточка сделки (только скаляры)
├── deal_risks             risk_type
├── deal_scores            criterion_key, value, reason, overridden
├── deal_score_history     recorded_at, source
│   └── deal_score_history_items   criterion_key, value
├── deal_tech              seeking_other_label, % требований
├── deal_seeking_segments  segment_id
├── deal_project_tasks     task
├── deal_as_is             segment_id, vendor, product, catalog_key, comment
├── deal_change_pains      segment_id, pain_text
└── deal_competitors       segment_id, vendor, product, catalog_key, status, …

audit_log
snapshots_daily
snapshots_deals
import_log
```

## Маппинг JS → PB

| JS | PB |
|----|-----|
| `lists.stages[]` | `list_items` rows list_key=stages |
| `scoring[]` + rubrics | `scoring_criteria` |
| `pipelineFocus` | `pipeline_meta.focus_*` |
| `deal.riskTypes[]` | `deal_risks` |
| `deal.scores` | `deal_scores` |
| `deal.scoreHistory` | `deal_score_history` + `_items` |
| `deal.techResearch` scalars | `deal_tech` |
| `seekingSegments` | `deal_seeking_segments` |
| `projectTasks` | `deal_project_tasks` |
| `asIsStack[seg]` | `deal_as_is` |
| `changePains[seg]` | `deal_change_pains` |
| `competitorEntries[seg][]` | `deal_competitors` |

Импорт: `recreate-collections.py` → затем `import-gas-to-pb.py` (следующий этап).

---

## Дополнения v4–v9 (прод, 2026)

Цепочка: `bash scripts/setup-schema-migrations.sh`

### v4 — CRM сущности сделки

| Коллекция | Назначение |
|-----------|------------|
| `deal_activities` | Лента событий сделки |
| `deal_tasks` | Задачи |
| `deal_files` | Файлы |
| `deal_contacts` | Контакты |
| `deal_info` | Доп. поля Amo |
| `user_profiles` | Профили UI |
| `notifications` | Уведомления |
| `saved_views` | Сохранённые фильтры |
| `report_presets` | Пресеты отчётов |

### v5 — требования clientmap

| Коллекция / поле | Назначение |
|------------------|------------|
| `pilot_requirements` | Строки карты пилота |
| `product_requirements` | Строки карты продукта |
| `deals.pilot_*`, `product_*` | Агрегаты % и счётчики |

### v6–v8 — поля deals / deal_tasks

- v6: Amo info fields на `deals` / `deal_info`
- v7: `presale_stage`, `presale_owner` на `deals`
- v8: `created_at` на `deal_tasks`

### v9 — пре-сейл map

| Коллекция | Назначение |
|-----------|------------|
| `presale_deals` | `deal_id` + JSON `data` (вместо `pipeline_meta.focus_goal`) |

### Справочники сущностей

`crm_companies`, `crm_contacts` — `add-entity-collections.py`

### Пользователи API

`pipeline_users` — логины Express auth (`ensure-pipeline-users.py`)

**Итого на проде:** ~32 коллекции. `verify-pb-import.py` проверяет только v3-подмножество.
