# Установка плагина dsh-llm-gigachat для DeepSeek Harness 0.2.x

## 📋 Требования

- **DeepSeek Harness**: версия `0.2.1-rc.1` или выше
- **Node.js**: 18+ (встроенный в DSH)
- **Учётные данные GigaChat**: `client_id` и `client_secret` от [Sber Developer Portal](https://developers.sber.ru/)

---

## 🚀 Быстрая установка

### Шаг 1: Создайте папку плагина

```powershell
mkdir "$env:USERPROFILE\.dsh\plugins\dsh-llm-gigachat"
```

### Шаг 2: Скопируйте файлы плагина

Скопируйте все файлы из папки проекта в папку плагина:

```powershell
$src = "C:\IdeaProjects\GIGACODE4DEEPSEEK\dsh-llm-gigachat-v2"
$dst = "$env:USERPROFILE\.dsh\plugins\dsh-llm-gigachat"
Copy-Item "$src\*" $dst -Recurse -Force
```

### Шаг 3: Добавьте учётные данные GigaChat

Откройте файл `C:\Users\bigle\.dsh\.credentials.yaml` и добавьте секцию `refs`:

```yaml
version: 1
refs:
  SBER_API_KEY: <base64(client_id:client_secret)>
# ... остальные записи
```

Где `<base64(client_id:client_secret)>` — это base64-кодированная строка `client_id:client_secret`.

**Как получить:**

```powershell
# Замените YOUR_CLIENT_ID и YOUR_CLIENT_SECRET на ваши значения
$cred = "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cred)
$base64 = [Convert]::ToBase64String($bytes)
Write-Host "SBER_API_KEY: $base64"
```

### Шаг 4: Установите плагин в профиль

> ⚠️ **Важно:** Десктопная версия DSH использует профиль `desktop`, веб-версия — профиль `web`. Они **изолированы** друг от друга. Установите плагин в нужный профиль.

#### Для Desktop-версии:

```powershell
# Полностью закройте DSH перед установкой!
dsh plugin --profile desktop add file:$env:USERPROFILE/.dsh/plugins/dsh-llm-gigachat
```

#### Для Web-версии:

```powershell
# Удалите старую версию, если есть
dsh plugin --profile web remove dsh-llm-gigachat

# Установите из локальной папки (ВАЖНО: используйте абсолютный путь!)
dsh plugin --profile web add file:$env:USERPROFILE/.dsh/plugins/dsh-llm-gigachat
```

> ⚠️ **Не используйте** `dsh plugin add dsh-llm-gigachat` без `file:` — pnpm скачает версию `0.1.1` из реестра npm, которая несовместима с DSH 0.2.x.

### Шаг 5: Добавьте провайдера вручную

DSH 0.2.x не поддерживает автоматическое создание провайдера. Добавьте его вручную:

1. Откройте **Settings → Models**
2. Нажмите **«+ Add custom provider»** (Добавить поставщика моделей)
3. Заполните:

   | Поле | Значение |
   |------|----------|
   | Provider ID | `sber` |
   | Display Name | `Sber GigaChat` |
   | Base URL | `http://127.0.0.1:8787/v1` |
   | API Protocol | `openai-completions` |
   | API Key | `MDFh...` (ваш base64-ключ) |

4. Нажмите **Fetch available models** — прокси вернёт 6 моделей GigaChat
5. Нажмите **Create provider**

### Шаг 6: Перезапустите DSH

```powershell
dsh web
```

В логах должно появиться:

```
gigachat: built-in OAuth proxy listening at http://127.0.0.1:8787/v1/chat/completions
GigaChat token refreshed: 1800s, expires ...
models passthrough: 6 chat models from upstream
```

### Шаг 7: Выберите модель

В правом нижнем углу интерфейса DSH выберите **GigaChat-3-Ultra** или другую модель из списка.

---

## 🔍 Проверка работы

### Проверка прокси

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8787/v1/models" -UseBasicParsing
```

Должен вернуться JSON:

```json
{
  "object": "list",
  "data": [
    {"id": "GigaChat-3-Ultra", "object": "model", "owned_by": "sber", "display_name": "GigaChat 3 Ultra"},
    {"id": "GigaChat-3-Pro", "object": "model", "owned_by": "sber", "display_name": "GigaChat 3 Pro"},
    ...
  ]
}
```

### Проверка токена

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8787/stats" -UseBasicParsing
```

```json
{
  "served": 0,
  "rateLimited": 0,
  "serverErrors": 0,
  "degenerateRetries": 0,
  "toolCallsTranslated": 0,
  "active": 0,
  "queueDepth": 0
}
```

---

## ⚙️ Настройки

Все настройки находятся в `C:\Users\bigle\.dsh\.dsh-settings.yaml` под секцией `gigachat:`:

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `enabled` | `true` | Включить/выключить прокси |
| `host` | `127.0.0.1` | Адрес прослушивания |
| `port` | `8787` | Порт прокси |
| `upstreamBaseURL` | `https://api.giga.chat/v1` | Базовый URL API GigaChat |
| `scope` | `GIGACHAT_API_PERS` | OAuth scope (`GIGACHAT_API_PERS`, `GIGACHAT_API_B2B`, `GIGACHAT_API_CORP`) |
| `maxConcurrency` | `1` | Максимум параллельных запросов |
| `tls.rejectUnauthorized` | `false` | Проверка TLS-сертификатов |

---

## 🐛 Устранение неполадок

### Прокси не запускается

```
gigachat: proxy failed to start: Port 8787 is busy
```

**Решение:** Измените порт в настройках:

```yaml
gigachat:
  port: 8788
```

### Ошибка 401 от GigaChat

**Решение:** Проверьте, что `SBER_API_KEY` в `.credentials.yaml` — это корректный `base64(client_id:client_secret)`:

```powershell
# Декодируйте и проверьте
$base64 = "MDFh...=="
$decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64))
Write-Host $decoded
# Должно быть: client_id:client_secret
```

### Ошибка 422 с инструментами

**Решение:** Используйте `GigaChat-3-Ultra` или `GigaChat-3-Pro` — они поддерживают tool-calling. Более слабые модели (`Lightning`, `GigaChat-2*`) автоматически получают `stripToolsFor`.

### Модели не появляются в интерфейсе

1. Убедитесь, что прокси работает: `netstat -ano | findstr ":8787"`
2. Проверьте: `Invoke-WebRequest http://127.0.0.1:8787/v1/models`
3. Добавьте провайдера вручную (см. Шаг 4)

---

## 📁 Структура проекта

```
dsh-llm-gigachat-v2/
├── package.json              # Конфигурация пакета
├── cordis.patch.yml          # Cordis mount-патч
├── lib/
│   ├── index.js              # Entry point + Config schema
│   ├── index.d.ts            # TypeScript определения
│   └── proxy.mjs             # OAuth-прокси
├── README.md                 # Документация (EN)
├── README.ru.md              # Документация (RU)
├── LICENSE
└── .gitignore
```

---

## 📝 Лицензия

MIT License
