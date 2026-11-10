# dsh-llm-gigachat

[![npm version](https://img.shields.io/npm/v/dsh-llm-gigachat.svg)](https://www.npmjs.com/package/dsh-llm-gigachat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH 0.2.x](https://img.shields.io/badge/DSH-0.2.x-blue)](https://github.com/deepseek-ai/deepseek-harness)

**DeepSeek Harness plugin for Sber GigaChat** — connects GigaChat LLM models to DSH with automatic OAuth proxy, provider route bootstrap, and tool-calling translation.

> **Compatible with DSH 0.2.x** (previously `0.1.x` only).

---

## 📋 Features

- **Built-in OAuth 2.0 proxy** — handles GigaChat token exchange automatically
- **OpenAI-compatible endpoint** — works with DSH's `openai-completions` API
- **Automatic provider route bootstrap** — GigaChat appears on the Models settings page
- **Upstream request serialization** — respects GigaChat's concurrency limits (prevents 429)
- **Degenerate response guard** — transparently retries corrupted `<` responses
- **Tool-calling translation** — translates modern `tools`/`tool_choice` to GigaChat's legacy `functions`/`function_call` format and back
- **Schema sanitization** — fixes missing `properties` in function schemas for weaker models
- **Streaming support** — SSE streaming with real-time tool_calls translation
- **Configurable via Settings UI** — all settings are editable through DSH's settings panel

---

## 📦 Installation

### Via npm (recommended)

```bash
dsh plugin --profile web add dsh-llm-gigachat
```

### Manual installation

```bash
# Clone or download the package
dsh plugin --profile web add ./path/to/dsh-llm-gigachat
```

### From GitHub

```bash
dsh plugin --profile web add git+https://github.com/bigleech/dsh-llm-gigachat.git
```

---

## ⚙️ Configuration

### 1. Obtain GigaChat Credentials

1. Go to the [Sber Developer Portal](https://developers.sber.ru/)
2. Create an application and obtain `client_id` and `client_secret`
3. Combine them as `base64(client_id:client_secret)`
4. Store the value in DSH's credentials (Models page → GigaChat → save API key)

### 2. Settings

All settings are under the `gigachat:` namespace and are editable through the DSH Settings UI.

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable the built-in OAuth proxy |
| `host` | `127.0.0.1` | Proxy listen address |
| `port` | `8787` | Proxy listen port |
| `upstreamBaseURL` | `https://api.giga.chat/v1` | GigaChat API base URL |
| `oauthURL` | `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` | OAuth token endpoint |
| `scope` | `GIGACHAT_API_PERS` | OAuth scope (`GIGACHAT_API_PERS`, `GIGACHAT_API_B2B`, or `GIGACHAT_API_CORP`) |
| `apiKeyEnv` | `SBER_API_KEY` | Credential reference name |
| `providerId` | `sber` | Provider route ID and Models page row identifier |
| `displayName` | `Sber GigaChat` | Display name in selectors |
| `tls.rejectUnauthorized` | `false` | TLS certificate verification (keep `false` on Windows with Russian NCC certs) |
| `maxConcurrency` | `1` | Maximum concurrent upstream requests (personal plan limit) |
| `models` | *6 GigaChat models* | Model catalog shown in the picker |
| `ensureRoute` | `true` | Auto-bootstrap the provider route in Settings |
| `stripToolsFor` | *Lightning, 2-Max, 2-Pro, 2* | Models that run without tools |

### 3. Models

Default model catalog:

| Model ID | Display Name |
|----------|-------------|
| `GigaChat-3-Ultra` | GigaChat 3 Ultra |
| `GigaChat-3-Pro` | GigaChat 3 Pro |
| `GigaChat-3-Lightning` | GigaChat 3 Lightning |
| `GigaChat-2-Max` | GigaChat 2 Max |
| `GigaChat-2-Pro` | GigaChat 2 Pro |
| `GigaChat-2` | GigaChat 2 |

---

## 🔧 How It Works

### Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  DeepSeek    │────▶│  dsh-llm-gigachat│────▶│   GigaChat      │
│  Harness     │     │  (OAuth proxy)   │     │   API           │
│              │◀────│  :8787           │     │                 │
└──────────────┘     └──────────────────┘     └─────────────────┘
                          │
                    ┌─────▼──────┐
                    │  OAuth     │
                    │  Token     │
                    │  Cache     │
                    └────────────┘
```

1. **OAuth Proxy** — runs locally on port 8787, handles token exchange with GigaChat
2. **Token Management** — cached until expiry with automatic refresh (30min TTL, 60s margin)
3. **Request Serialization** — FIFO queue with configurable concurrency (default: 1)
4. **Tool Translation** — bidirectional translation between modern `tools` and legacy `functions`
5. **Route Bootstrap** — creates the provider entry in DSH's settings automatically

---

## 📊 Proxy Stats

The proxy exposes a `/stats` endpoint for monitoring:

```bash
curl http://127.0.0.1:8787/stats
```

Response:

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

## 🛡️ Security Notes

### TLS Certificate Verification

By default, `tls.rejectUnauthorized` is `false` because Russian NCC (НУЦ Минцифры) CA-signed certificates used by GigaChat are not in the default Node.js trust store on Windows.

**To harden security:**

1. Install the Russian NCC root certificates:
   - Download from: [https://kpm.ru/ru/about/encryption/crypto-services/root-certificates/](https://kpm.ru/ru/about/encryption/crypto-services/root-certificates/)
   - Install in Windows Certificate Store → Trusted Root Certification Authorities
2. Set `tls.rejectUnauthorized` to `true`

### Credential Storage

Credentials are stored in DSH's secure credentials store (`~/.dsh/.credentials.yaml`), not in plain text. The value should be `base64(client_id:client_secret)`.

---

## 🐛 Troubleshooting

### "422: Field 'properties.args.properties' is missing"

This happens with weaker models (Lightning, GigaChat-2*). The plugin automatically sanitizes schemas, but if you still see this:

1. Make sure `stripToolsFor` includes the problematic model
2. Or switch to GigaChat-3-Ultra / GigaChat-3-Pro for full tool support

### "429: Rate limit exceeded"

Personal GigaChat plans allow ~1 concurrent request. The plugin queues requests automatically. If you see frequent 429s:

1. Check `maxConcurrency` (should be `1` for personal plans)
2. Check the proxy stats: `curl http://127.0.0.1:8787/stats`
3. Consider upgrading your GigaChat plan

### "Port 8787 is busy"

Another service is using the proxy port. Change the port in settings:

```yaml
gigachat:
  port: 8788
```

### "GigaChat rejected the access token (401)"

1. Verify your `client_id:client_secret` combination
2. Check that the base64 encoding is correct: `echo -n "client_id:client_secret" | base64`
3. Make sure the scope matches your account type (`GIGACHAT_API_PERS` for personal)

### Plugin doesn't appear in DSH 0.2.x

Make sure you're using the `0.2.x` version of the plugin. The old `0.1.x` version used `settings.installSection()` which was removed in DSH 0.2.x.

---

## 📚 API Reference

### Plugin Exports

```javascript
import { name, inject, Config, SettingsSchema, apply } from 'dsh-llm-gigachat';
```

| Export | Type | Description |
|--------|------|-------------|
| `name` | `string` | Plugin identifier: `"llm-gigachat"` |
| `inject` | `string[]` | Dependencies: `[]` (no hard dependencies; proxy starts independently) |
| `Config` | `z<Config>` | Zod schema for configuration |
| `SettingsSchema` | `z<Config>` | Alias of `Config` |
| `apply` | `function` | Plugin lifecycle entry point |

---

## Credits & Acknowledgments

This plugin is a **DSH 0.2.x compatibility fork** of the original [`dsh-llm-gigachat`](https://github.com/igrock88/dsh-llm-gigachat) by **Igor Korobeynikov** ([@igrock88](https://github.com/igrock88)). The core OAuth proxy, tool-calling translation, and request serialization logic are based on his work.

The fork adds:
- DSH 0.2.x compatibility (`.volatile()` settings, removal of `settings.installSection()`)
- Unwrapping of volatile config objects via `.get()`
- Independent proxy startup (no hard `inject` dependency)
- Updated `package.json` for `engines.dsh: ">=0.2.1-rc.1"`

If you find this useful, please consider starring the [original repository](https://github.com/igrock88/dsh-llm-gigachat) as well.

---

## 📝 License

[MIT License](LICENSE)

---

## 🤝 Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/bigleech/dsh-llm-gigachat).
