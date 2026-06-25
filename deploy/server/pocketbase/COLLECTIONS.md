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
