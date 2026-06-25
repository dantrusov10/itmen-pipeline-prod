# Дублирование окружения (PROD + STAGING)

Две **идентичные** копии пайплайна:

| | PROD (менеджеры) | STAGING (разработка) |
|---|---|---|
| **GitHub** | [itmen-pipeline-old](https://github.com/dantrusov10/itmen-pipeline-old) | [itmen-pipeline-prod](https://github.com/dantrusov10/itmen-pipeline-prod) |
| **GitHub Pages** | https://dantrusov10.github.io/itmen-pipeline-old/ | — (сервер nwlvl.ru) |
| **Google Таблица** | `1pN937eK0xg4svGMHCdBfUhr3iAihuDl_fkj8U_XrL2g` | `1AbPqam0TkVdbtmyQ_KdjLGXw93qNSs4Svug8pMfP1_c` |
| **GAS** | свой URL в `gas-config.js` | свой URL в `gas-config.js` |
| **Кто работает** | менеджеры | только разработка |

STAGING помечен жёлтым баннером в интерфейсе (`environment: "staging"`).

---

## Схема

```
PROD                          STAGING
GitHub Pages (prod)           GitHub Pages (staging)
      ↓                              ↓
GAS URL #1                    GAS URL #2
      ↓                              ↓
Google Таблица #1             Google Таблица #2 (копия)
```

Окружения **не связаны**. Изменения в staging не попадают в prod автоматически.

---

## Способ A — копия Google Таблицы (рекомендуется, 1:1)

Самый быстрый путь: копируются **все листы** (`_pipeline`, `_audit`, `_snapshots_*`) и привязанный Apps Script.

### 1. Скопировать таблицу

1. Откройте prod-таблицу:  
   https://docs.google.com/spreadsheets/d/1pN937eK0xg4svGMHCdBfUhr3iAihuDl_fkj8U_XrL2g/edit
2. **Файл → Создать копию**
3. Назовите: `ITMen Pipeline STAGING`
4. Запишите ID новой таблицы из URL (`/d/ЭТОТ_ID/edit`)

### 2. Обновить Apps Script в копии

1. В копии: **Расширения → Apps Script**
2. Замените `Code.gs` на актуальный из репозитория [`gas/Code.gs`](./gas/Code.gs)  
   (важно: там есть `importEnvironmentClone` для повторной синхронизации)
3. **Сохранить** → функция `setup` → **Выполнить** (на всякий случай)

### 3. Новое развёртывание веб-приложения

1. **Развернуть → Новое развертывание**
2. Тип: **Веб-приложение**
3. Запуск от имени: **Я**
4. Доступ: **Все**
5. Скопируйте **новый URL** (`https://script.google.com/macros/s/.../exec`)

Проверка: `ВАШ_URL?action=health` → `ok: true`, `auditRows` ≈ 7600, сделок 218.

### 4. Подключить staging-репозиторий

В репозитории **itmen-pipeline-staging** файл `js/gas-config.js`:

```javascript
window.ITMEN_GAS_CONFIG = {
  url: "https://script.google.com/macros/s/ВАШ_STAGING_ID/exec",
  environment: "staging",
  label: "STAGING — копия для разработки",
  spreadsheetId: "ID_НОВОЙ_ТАБЛИЦЫ",
  pagesUrl: "https://dantrusov10.github.io/itmen-pipeline-staging/",
};
```

Закоммитьте → GitHub Actions задеплоит Pages.

### 5. Сверка

```bash
cp tools/env_urls.example.json tools/env_urls.json
# впишите staging gasUrl и spreadsheetId
python tools/verify_environments.py
```

---

## Способ B — пустая таблица + скрипт клонирования

Если копия через Drive неудобна:

1. Создайте **новую** Google Таблицу (sheets.new)
2. Вставьте `gas/Code.gs` → `setup()` → разверните веб-приложение
3. Настройте `tools/env_urls.json`:

```json
{
  "production": { "gasUrl": "https://script.google.com/macros/s/...PROD.../exec" },
  "staging": { "gasUrl": "https://script.google.com/macros/s/...STAGING.../exec" }
}
```

4. Запустите:

```bash
python tools/clone_prod_to_staging.py          # dry-run
python tools/clone_prod_to_staging.py --apply  # полная копия state + аудит
python tools/verify_environments.py
```

---

## GitHub: два репозитория

| Репозиторий | Назначение |
|---|---|
| `dantrusov10/itmen-pipeline-old` | LEGACY — Google Таблицы / GAS, GitHub Pages |
| `dantrusov10/itmen-pipeline-prod` | PROD — PocketBase + сервер (itmen-pipeline.nwlvl.ru) |

Код изначально одинаковый. Отличаются только `js/gas-config.js` и баннер окружения.

### GitHub Pages на staging

Репозиторий → **Settings → Pages → Source: GitHub Actions**  
(workflow `.github/workflows/pages.yml` уже в репозитории)

---

## Повторная синхронизация staging с prod

Когда нужно обновить staging актуальным срезом prod (без влияния на prod):

```bash
python tools/clone_prod_to_staging.py --apply
```

Или снова **Создать копию** prod-таблицы и заменить staging-таблицу.

---

## Важно

1. **Менеджерам** давать только ссылку PROD Pages.
2. **Не путать URL** в `gas-config.js` — staging фронт должен смотреть только на staging GAS.
3. После изменения `Code.gs` в **любом** окружении — **новое развертывание** веб-приложения.
4. PROD `Code.gs` обновляйте осторожно; staging — для проверки перед prod.

---

## Чеклист готовности

- [ ] Staging Google Таблица: 218 сделок, аудит ~7600 строк
- [ ] Staging GAS health OK
- [ ] `itmen-pipeline-staging` на GitHub Pages открывается
- [ ] Жёлтый баннер «STAGING» виден
- [ ] `python tools/verify_environments.py` — без расхождений
- [ ] Менеджеры по-прежнему на prod URL
