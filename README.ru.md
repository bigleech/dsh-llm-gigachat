# dsh-llm-gigachat

[![npm version](https://img.shields.io/npm/v/dsh-llm-gigachat.svg)](https://www.npmjs.com/package/dsh-llm-gigachat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH 0.2.x](https://img.shields.io/badge/DSH-0.2.x-blue)](https://github.com/deepseek-ai/deepseek-harness)

**Плагин DeepSeek Harness для Sber GigaChat** — подключает LLM-модели GigaChat к DSH через встроенный OAuth-прокси, автоматическую настройку провайдера и трансляцию tool-calling.

> **Совместим с DSH 0.2.x** (ранее только `0.1.x`).

---

## 📋 Возможности

- **Встроенный OAuth 2.0 прокси** — автоматически обрабатывает обмен токенами GigaChat
- **API-совместимый с OpenAI** — работает с API `openai-completions` DSH
- **Автоматическая настройка провайдера** — GigaChat появляется на странице Models
- **Сериализация запросов** — учитывает ограничения параллельных запросов GigaChat (предотвращает 429)
- **Защита от вырожденных ответов** — прозрачно повторяет повреждённые ответы `<`
- **Трансляция tool-calling** — переводит современные `tools`/`tool_choice` в устаревший формат `functions`/`function_call` GigaChat и обратно
- **Санитизация схем** — исправляет отсутствующие `properties` в схемах функций для слабых моделей
- **Поддержка стриминга** — SSE-стриминг с трансляцией tool_calls в реальном времени
- **Настраивается через UI** — все параметры редактируются через панель настроек DSH

---

## 📦 Установка

### Через npm (рекомендуется)

```bash
dsh plugin --profile web add dsh-llm-gigachat
```

### Ручная установка

```bash
# Клонируйте или скачайте пакет
dsh plugin --profile web add ./путь/к/dsh-llm-gigachat
```

---

## ⚙️ Настройка

### 1. Получение учётных данных GigaChat

1. Перейдите на [Портал разработчика Сбера](https://developers.sber.ru/)
2. Создайте приложение и получите `client_id` и `client_secret`
3. Объедините их как `base64(client_id:client_secret)`
4. Сохраните значение в учётных данных DSH (страница Models → GigaChat → сохранить API-ключ)

### 2. Параметры

Все параметры находятся в пространстве имён `gigachat:` и редактируются через панель настроек DSH.

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `enabled` | `true` | Включить/выключить встроенный OAuth-прокси |
| `host` | `127.0.0.1` | Адрес прослушивания прокси |
| `port` | `8787` | Порт прослушивания прокси |
| `upstreamBaseURL` | `https://api.giga.chat/v1` | Базовый URL API GigaChat |
| `oauthURL` | `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` | Точка обмена OAuth-токенами |
| `scope` | `GIGACHAT_API_PERS` | Область OAuth (`GIGACHAT_API_PERS`, `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP`) |
| `apiKeyEnv` | `SBER_API_KEY` | Имя ссылки на учётные данные |
| `providerId` | `sber` | ID маршрута провайдера и строка на странице Models |
| `displayName` | `Sber GigaChat` | Отображаемое имя в селекторах |
| `tls.rejectUnauthorized` | `false` | Проверка TLS-сертификатов (оставьте `false` на Windows с российскими сертификатами НУЦ) |
| `maxConcurrency` | `1` | Максимум параллельных запросов к upstream (лимит личного плана) |
| `models` | *6 моделей GigaChat* | Каталог моделей в селекторе |
| `ensureRoute` | `true` | Автоматически создать маршрут провайдера в настройках |
| `stripToolsFor` | *Lightning, 2-Max, 2-Pro, 2* | Модели, работающие без инструментов |

### 3. Модели

Каталог моделей по умолчанию:

| ID модели | Отображаемое имя |
|-----------|-----------------|
| `GigaChat-3-Ultra` | GigaChat 3 Ultra |
| `GigaChat-3-Pro` | GigaChat 3 Pro |
| `GigaChat-3-Lightning` | GigaChat 3 Lightning |
| `GigaChat-2-Max` | GigaChat 2 Max |
| `GigaChat-2-Pro` | GigaChat 2 Pro |
| `GigaChat-2` | GigaChat 2 |

---

## 🔧 Как это работает

### Архитектура

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  DeepSeek    │────▶│  dsh-llm-gigachat│────▶│   GigaChat      │
│  Harness     │     │  (OAuth прокси)  │     │   API           │
│              │◀────│  :8787           │     │                 │
└──────────────┘     └──────────────────┘     └─────────────────┘
                          │
                    ┌─────▼──────┐
                    │  OAuth     │
                    │  Токен     │
                    │  Кэш       │
                    └────────────┘
```

1. **OAuth-прокси** — работает локально на порту 8787, обрабатывает обмен токенами с GigaChat
2. **Управление токенами** — кэшируется до истечения срока действия с автоматическим обновлением (TTL 30 мин, запас 60 сек)
3. **Сериализация запросов** — очередь FIFO с настраиваемым параллелизмом (по умолчанию: 1)
4. **Трансляция инструментов** — двунаправленный перевод между современными `tools` и устаревшими `functions`
5. **Настройка маршрута** — автоматически создаёт запись провайдера в настройках DSH

---

## 📊 Статистика прокси

Прокси предоставляет endpoint `/stats` для мониторинга:

```bash
curl http://127.0.0.1:8787/stats
```

Ответ:

```json
{
  "served": 42,
  "rateLimited": 3,
  "serverErrors": 0,
  "degenerateRetries": 1,
  "toolCallsTranslated": 7,
  "active": 0,
  "queueDepth": 0
}
```

---

## 🛡️ Вопросы безопасности

### Проверка TLS-сертификатов

По умолчанию `tls.rejectUnauthorized` равен `false`, потому что российские корневые сертификаты НУЦ (Минцифры), используемые GigaChat, отсутствуют в стандартном хранилище доверенных сертификатов Node.js на Windows.

**Для повышения безопасности:**

1. Установите корневые сертификаты НУЦ:
   - Скачайте: [https://kpm.ru/ru/about/encryption/crypto-services/root-certificates/](https://kpm.ru/ru/about/encryption/crypto-services/root-certificates/)
   - Установите в Хранилище сертификатов Windows → Доверенные корневые центры сертификации
2. Установите `tls.rejectUnauthorized` в `true`

### Хранение учётных данных

Учётные данные хранятся в безопасном хранилище DSH (`~/.dsh/.credentials.yaml`), а не в открытом виде. Значение должно быть `base64(client_id:client_secret)`.

---

## 🐛 Устранение неполадок

### "422: Field 'properties.args.properties' is missing"

Это происходит с более слабыми моделями (Lightning, GigaChat-2*). Плагин автоматически санитизирует схемы, но если вы всё ещё видите это:

1. Убедитесь, что `stripToolsFor` включает проблемную модель
2. Или переключитесь на GigaChat-3-Ultra / GigaChat-3-Pro для полной поддержки инструментов

### "429: Превышен лимит частоты запросов"

Личные планы GigaChat позволяют ~1 параллельный запрос. Плагин автоматически ставит запросы в очередь. Если часто появляются 429:

1. Проверьте `maxConcurrency` (должно быть `1` для личных планов)
2. Проверьте статистику прокси: `curl http://127.0.0.1:8787/stats`
3. Рассмотрите возможность обновления плана GigaChat

### "Порт 8787 занят"

Другой сервис использует порт прокси. Измените порт в настройках:

```yaml
gigachat:
  port: 8788
```

### "GigaChat отклонил токен доступа (401)"

1. Проверьте комбинацию `client_id:client_secret`
2. Убедитесь, что base64-кодирование выполнено правильно: `echo -n "client_id:client_secret" | base64`
3. Убедитесь, что область соответствует вашему типу учётной записи (`GIGACHAT_API_PERS` для личных)

### Плагин не появляется в DSH 0.2.x

Убедитесь, что вы используете версию плагина `0.2.x`. Старая версия `0.1.x` использовала `settings.installSection()`, которая была удалена в DSH 0.2.x.

---

## 📚 Справочник API

### Экспорты плагина

```javascript
import { name, inject, Config, SettingsSchema, apply } from 'dsh-llm-gigachat';
```

| Экспорт | Тип | Описание |
|---------|-----|----------|
| `name` | `string` | Идентификатор плагина: `"llm-gigachat"` |
| `inject` | `string[]` | Зависимости: `[]` (нет жёстких зависимостей; прокси запускается независимо) |
| `Config` | `z<Config>` | Zod-схема конфигурации |
| `SettingsSchema` | `z<Config>` | Псевдоним `Config` |
| `apply` | `function` | Точка входа жизненного цикла плагина |

---

## Credits & Acknowledgments

Этот плагин — **форк для совместимости с DSH 0.2.x** оригинального [`dsh-llm-gigachat`](https://github.com/igrock88/dsh-llm-gigachat) от **Igor Korobeynikov** ([@igrock88](https://github.com/igrock88)). Базовая логика OAuth-прокси, трансляции tool-calling и сериализации запросов основана на его работе.

Форк добавляет:
- Совместимость с DSH 0.2.x (`.volatile()` настройки, удаление `settings.installSection()`)
- Распаковку volatile-объектов через `.get()`
- Независимый запуск прокси (без жёсткой зависимости `inject`)
- Обновлённый `package.json` для `engines.dsh: ">=0.2.1-rc.1"`

Если вам это полезно, пожалуйста, поставьте звёздочку и [оригинальному репозиторию](https://github.com/igrock88/dsh-llm-gigachat).

---

## 📝 Лицензия

[MIT License](LICENSE)

---

## 🤝 Вклад

Проблемы и pull requests приветствуются на [GitHub](https://github.com/bigleech/dsh-llm-gigachat).
