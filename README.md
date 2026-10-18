# tele server

Сервер, совместимый с [docs/server.md](https://github.com/nitreojs/tele/blob/main/docs/server.md) клиента tele: отдаёт список меток (`/v1/badges`), уведомления, принимает краш-репорты (`/v1/crash.php`) и содержит админ-панель.

Без внешних зависимостей. Нужен **Node.js 24.7 или новее** (используется `crypto.argon2Sync`).

## Запуск

```bash
cd tele-server
node server.js
```

Переменные окружения:

| переменная    | по умолчанию          | что делает                                          |
|---------------|-----------------------|-----------------------------------------------------|
| `PORT`        | `8080`                | порт HTTP                                           |
| `ADMIN_TOKEN` | генерируется          | токен для входа в админку                           |
| `DATA_DIR`    | `./data`              | где хранить базу, дампы и картинки уведомлений      |

При первом запуске в консоли появится админ-токен (если `ADMIN_TOKEN` не задан). Он же хранится в `data/db.json`.

- Админка: `http://localhost:8080/admin`
- Список для клиента: `http://localhost:8080/v1/badges`
- В клиенте tele укажите адрес сервера: **settings → tele → server**.

Чтобы клиент подключался снаружи, сервер нужно вывести в интернет: за reverse proxy (nginx, Caddy) с HTTPS. Клиент tele ходит по HTTPS.

## Запуск через systemd (автозапуск и перезапуск)

Пример для Linux с systemd. Предполагается, что сервер лежит в `/opt/tele-server`, а запускает его пользователь `tele`.

1. Создайте пользователя и скопируйте файлы:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tele
sudo mkdir -p /opt/tele-server
sudo cp -r server.js public /opt/tele-server/
sudo chown -R tele:tele /opt/tele-server
```

2. Создайте файл `/etc/systemd/system/tele-server.service`:

```ini
[Unit]
Description=tele badges and crash server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tele
WorkingDirectory=/opt/tele-server
ExecStart=/usr/bin/node /opt/tele-server/server.js
Environment=PORT=8080
Environment=ADMIN_TOKEN=замените-на-свой-длинный-токен
Environment=DATA_DIR=/opt/tele-server/data
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Путь к node узнайте командой `which node` и подставьте его в `ExecStart`, если он другой.

3. Включите и запустите сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tele-server
```

Полезные команды:

```bash
systemctl status tele-server        # состояние
journalctl -u tele-server -f        # логи в реальном времени
sudo systemctl restart tele-server  # перезапуск после обновления кода
```

Админ-токен в systemd лучше задать через `ADMIN_TOKEN`, тогда он не попадает в логи. Если переменная не задана, токен виден один раз в `journalctl -u tele-server`.

## Структура

```
server.js          сервер (API для клиента и админки)
public/admin.html  админ-панель
data/              создаётся сам: db.json, dumps/, photos/ (не коммитится)
```

## Что умеет

- **Аккаунты:** метки `checkmark`, `scam`, `fake`, `support`, `supportText`, иконка, описание. Ключи — argon2id по правилам из доки, список отсортирован.
- **Алиасы username:** дополнительные `@username` с позицией.
- **Уведомления:** типы, toast, кнопки, entities, картинка (jpeg/png до 1 МБ), фильтры по build, платформе, пользователям и времени. Правка увеличивает `rev`.
- **Краши:** приём отчётов и дампов, строки `Tele-Note:` выводятся тегами. Приём можно выключить в админке (тогда сервер отвечает 404).
- **Соль:** можно сгенерировать новую или включить автосмену раз в месяц.
