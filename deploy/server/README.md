# ITMen Pipeline — сервер (PocketBase)

Корень на сервере: `/opt/itmen-pipeline`

## Структура

```
/opt/itmen-pipeline/
├── pocketbase              # бинарник PB
├── pb_data/                # SQLite + файлы
├── pb_migrations/          # миграции схемы
├── frontend/               # статика UI (git clone staging)
├── api/                    # Node middleware (следующий этап)
├── backups/                # бэкапы pb_data
├── scripts/                # backup, health, migrate
├── infra/
│   ├── systemd/            # unit-файл
│   └── nginx/              # шаблон reverse proxy
└── .env                    # секреты (не в git)
```

## Сервисы

| Компонент | Порт | Доступ |
|-----------|------|--------|
| PocketBase API | `127.0.0.1:8095` | через nginx / SSH tunnel |
| Admin UI | `/_/ ` на том же порту | только VPN/SSH или nginx+auth |

## Команды

```bash
# статус
systemctl status pb-itmen-pipeline

# логи
journalctl -u pb-itmen-pipeline -f

# health
curl -s http://127.0.0.1:8095/api/health

# бэкап
/opt/itmen-pipeline/scripts/backup.sh

# первичная установка (уже выполнена setup.sh)
sudo /opt/itmen-pipeline/scripts/setup.sh
```

## Домен (следующий шаг)

1. DNS A-запись → `2.58.69.58`
2. `cp infra/nginx/pipeline.conf.example /etc/nginx/sites-available/pipeline.YOUR_DOMAIN`
3. `certbot --nginx -d pipeline.YOUR_DOMAIN`
4. `nginx -t && systemctl reload nginx`

## Доступ (без SSH)

**Admin UI:** https://itmen-pipeline.nwlvl.ru/_/

**API health:** https://itmen-pipeline.nwlvl.ru/api/health

Логин и пароль — в `/opt/itmen-pipeline/.env` на сервере (`PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`).

## SSH tunnel (если nginx недоступен)

```bash
ssh -L 8095:127.0.0.1:8095 newlevel-prod
# Admin: http://localhost:8095/_/
```
