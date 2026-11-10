import http from "node:http";
import z from "@deepseek-ai/schemastery";
import { createGigaChatProxy, DEFAULT_MODELS } from "./proxy.mjs";

const name = "llm-gigachat";
const NS = "gigachat";
const LLM_PI_AI_NS = "llm-pi-ai";

// Вспомогательная функция для извлечения значений из volatile-полей DSH 0.2.x
function getVal(obj, key, fallback) {
  let val = obj[key];
  if (val === undefined || val === null) return fallback;
  if (typeof val === "object" && typeof val.get === "function") {
    val = val.get();
  }
  return val !== undefined && val !== null ? val : fallback;
}

function volatileField(field) {
  if (typeof field.volatile === "function") return field.volatile();
  if (typeof field.extra === "function") return field.extra("volatile", true);
  if (field && typeof field === "object" && field.meta !== undefined) {
    field.meta = { ...field.meta, volatile: true };
  }
  return field;
}

const ModelSchema = z.object({
  id: z.string(),
  name: z.union([z.string(), z.const(null)]).default(null)
});

const WEAK_TOOL_MODELS = ["GigaChat-3-Lightning", "GigaChat-2-Max", "GigaChat-2-Pro", "GigaChat-2"];

const Config = z.object({
  enabled: volatileField(z.boolean().default(true)),
  host: volatileField(z.string().default("127.0.0.1")),
  port: volatileField(z.number().default(8787)),
  upstreamBaseURL: volatileField(z.string().default("https://api.giga.chat/v1")),
  oauthURL: volatileField(z.string().default("https://ngw.devices.sberbank.ru:9443/api/v2/oauth")),
  scope: volatileField(z.string().default("GIGACHAT_API_PERS")),
  apiKeyEnv: volatileField(z.string().default("SBER_API_KEY")),
  providerId: volatileField(z.string().default("sber")),
  displayName: volatileField(z.string().default("Sber GigaChat")),
  tls: volatileField(z.object({ rejectUnauthorized: z.boolean().default(false) }).default({})),
  maxConcurrency: volatileField(z.number().default(1)),
  models: volatileField(z.array(ModelSchema).default(DEFAULT_MODELS)),
  ensureRoute: volatileField(z.boolean().default(true)),
  stripToolsFor: volatileField(z.array(z.string()).default(WEAK_TOOL_MODELS))
});

const SettingsSchema = Config;
const inject = [];

const PROBE_TIMEOUT_MS = 1500;

function apply(ctx, config) {
  const log = ctx.logger ?? console;

  let settingsApi = null;
  try { settingsApi = ctx.get("settings") ?? null; } catch (e) {}

  let proxy = null;
  let proxyServing = false;

  const tlsObj = getVal(config, "tls", {});
  const rejectUnauthorized = tlsObj.rejectUnauthorized === true;
  const rawModels = getVal(config, "models", DEFAULT_MODELS);
  const rawStrip = getVal(config, "stripToolsFor", []);

  const cfg = {
    enabled: getVal(config, "enabled", true) !== false,
    host: getVal(config, "host", "127.0.0.1"),
    port: getVal(config, "port", 8787),
    upstreamBaseURL: getVal(config, "upstreamBaseURL", "https://api.giga.chat/v1"),
    oauthURL: getVal(config, "oauthURL", "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"),
    scope: getVal(config, "scope", "GIGACHAT_API_PERS"),
    apiKeyEnv: getVal(config, "apiKeyEnv", "SBER_API_KEY"),
    providerId: getVal(config, "providerId", "sber"),
    displayName: getVal(config, "displayName", "Sber GigaChat"),
    rejectUnauthorized: rejectUnauthorized,
    maxConcurrency: Math.min(8, Math.max(1, Math.floor(getVal(config, "maxConcurrency", 1)))),
    models: Array.isArray(rawModels) && rawModels.length > 0 ? rawModels : DEFAULT_MODELS,
    ensureRoute: getVal(config, "ensureRoute", true) !== false,
    stripToolsFor: Array.isArray(rawStrip) ? rawStrip.filter((x) => typeof x === "string") : []
  };

  async function resolveCredentials() {
    const credentials = ctx.get("credentials");
    if (credentials !== void 0) {
      try {
        const hit = credentials.resolve ? await credentials.resolve(cfg.apiKeyEnv) : await credentials.get(cfg.apiKeyEnv);
        if (hit && typeof hit === "string" && hit.length > 0) return hit;
        if (hit && typeof hit === "object" && typeof hit.value === "string" && hit.value.length > 0) return hit.value;
      } catch (err) {
        log.warn(`gigachat: credential resolve failed: ${err.message}`);
      }
    }
    return process.env[cfg.apiKeyEnv] ?? process.env.GIGACHAT_CREDENTIALS;
  }

  function portServesModels(host, port) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const req = http.get({ host, port, path: "/v1/models", timeout: PROBE_TIMEOUT_MS }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            done(Array.isArray(json?.data) && json.data.length > 0);
          } catch { done(false); }
        });
        res.on("error", () => done(false));
      });
      req.on("timeout", () => { try { req.destroy(); } catch {} done(false); });
      req.on("error", () => done(false));
    });
  }

  async function startProxy() {
    if (!cfg.enabled) return;
    if (proxy) return;
    if (await portServesModels(cfg.host, cfg.port)) {
      log.info(`gigachat: port ${cfg.port} already serves models — external proxy assumed`);
      proxyServing = true;
      return;
    }
    const factory = createGigaChatProxy({
      host: cfg.host, port: cfg.port, upstreamBaseURL: cfg.upstreamBaseURL,
      oauthURL: cfg.oauthURL, scope: cfg.scope, apiKeyEnv: cfg.apiKeyEnv,
      maxConcurrency: cfg.maxConcurrency, rejectUnauthorized: cfg.rejectUnauthorized,
      models: cfg.models, stripToolsFor: cfg.stripToolsFor ?? [], resolveCredentials,
      logger: { info: (...a) => log.info(...a), warn: (...a) => log.warn(...a), error: (...a) => log.error(...a) }
    });
    try {
      await factory.listen();
    } catch (err) {
      log.error(`gigachat: proxy failed to start: ${err.message}`);
      proxyServing = false;
      return;
    }
    proxy = factory;
    proxyServing = true;
    log.info(`gigachat: built-in OAuth proxy listening at ${factory.address()}/v1/chat/completions`);
  }

  async function bootstrapRoute() {
    if (!settingsApi || !cfg.ensureRoute || !cfg.providerId) return;
    if (!proxyServing) return;
    try {
      const route = {
        displayName: cfg.displayName, apiKeyEnv: cfg.apiKeyEnv, api: "openai-completions",
        baseURL: `http://${cfg.host}:${cfg.port}/v1`,
        models: cfg.models.map((m) => (m.name ? { id: m.id, name: m.name } : { id: m.id }))
      };
      await settingsApi.mutate(LLM_PI_AI_NS, [{ op: "set", path: ["providers", cfg.providerId], value: route }]);
      log.info(`gigachat: bootstrap route "${cfg.providerId}" -> ${route.baseURL}`);
    } catch (err) {
      log.error(`gigachat: route bootstrap failed: ${err.message}`);
    }
  }

  startProxy().then(() => bootstrapRoute()).catch(err => log.error(`gigachat: startup failed: ${err.message}`));

  ctx.effect(function* () {
    yield () => { if (proxy) { try { proxy.close(); } catch {} proxy = null; } };
  });
}

export { Config, SettingsSchema, apply, inject, name };
