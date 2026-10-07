import type { ProviderId, Settings } from "./types";

/**
 * Server-only. Do not import this module from client components:
 * it reads API key environment variables.
 */
export type ApiKeySource = "saved" | "env" | "none";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function envApiKey(provider: ProviderId, baseUrl: string) {
  const generic = readEnv("DEEPSTUDY_API_KEY");
  if (generic) return generic;
  const deepseek = readEnv("DEEPSEEK_API_KEY");
  if (!deepseek) return "";
  const host = baseUrl.toLowerCase();
  if (provider === "deepseek" || host.includes("api.deepseek.com")) return deepseek;
  return "";
}

export function applyEnvApiKey(settings: Settings): Settings {
  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  const saved = settings.apiKey.trim();
  return {
    ...settings,
    baseUrl,
    apiKey: saved || envApiKey(settings.provider, baseUrl),
  };
}

export function apiKeyStatus(settings: Settings): { hasKey: boolean; keySource: ApiKeySource } {
  if (settings.apiKey.trim()) return { hasKey: true, keySource: "saved" };
  if (envApiKey(settings.provider, settings.baseUrl)) return { hasKey: true, keySource: "env" };
  return { hasKey: false, keySource: "none" };
}
