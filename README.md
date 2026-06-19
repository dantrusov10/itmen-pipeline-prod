# ITMen Pipeline — веб-инструмент Q3

Пайплайн сделок, техническое исследование, скоринг. Данные хранятся на сервере (`data/pipeline.json`).

## Быстрый старт

```bash
cp .env.example .env
# Отредактируйте JWT_SECRET, ADMIN_PIN, MANAGER_PIN

npm install
npm run seed    # первичная загрузка данных (один раз)
npm start       # http://localhost:3000
```

## Вход

| Пользователь | Логин | PIN (по умолчанию) |
|---|---|---|
| Администратор | `admin` | из `ADMIN_PIN` (.env) |
| Аркадий Мерлейн | `merlein` | из `MANAGER_PIN` |
| Арслан Ахметшин | `akhmetshin` | из `MANAGER_PIN` |
| Александр Сироткин | `sirotkin` | из `MANAGER_PIN` |
| Алексей Кулагин | `kulagin` | из `MANAGER_PIN` |

- **Менеджер** видит и редактирует только свои сделки
- **Администратор** видит весь пайплайн, может сбрасывать данные

## Возможности

- Дашборд пайплайна
- Паспорт сделки (5 блоков тех. исследования + скоринг)
- Импорт Excel (шаблон для менеджеров)
- Автосохранение на сервер (кнопка 💾 Сохранить)

## API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/login` | `{ login, pin }` |
| GET | `/api/pipeline` | Получить состояние |
| PUT | `/api/pipeline` | Сохранить состояние |
| GET | `/api/export/template` | Скачать Excel-шаблон |

## Деплой

### Docker

```bash
docker build -t itmen-pipeline .
docker run -p 3000:3000 -v itmen-data:/app/data --env-file .env itmen-pipeline
```

### Railway / Render / VPS

1. Подключите репозиторий Git
2. Build: `npm install`
3. Start: `npm start`
4. Задайте переменные из `.env.example`
5. Примонтируйте volume к `/app/data` для сохранения `pipeline.json`

## Структура

```
server/          — Express API + JSON storage
js/              — фронтенд
data/            — pipeline.json (создаётся автоматически)
build_*.py       — генераторы шаблонов и architecture-data
```

## Локальная разработка без сервера

Откройте `index.html` напрямую — работает режим localStorage (без `js/api.js` или с `ITMEN_API.enabled = false`).
