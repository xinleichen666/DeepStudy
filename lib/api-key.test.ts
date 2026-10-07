import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyStatus, applyEnvApiKey } from "./api-key.ts";
import type { Settings } from "./types.ts";

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    provider: "deepseek",
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    ...patch,
  };
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("saved key wins over DeepSeek environment variables", () => {
  withEnv({ DEEPSEEK_API_KEY: "env-deepseek", DEEPSTUDY_API_KEY: "env-generic" }, () => {
    const input = settings({ apiKey: "saved-key" });
    const resolved = applyEnvApiKey(input);
    assert.equal(resolved.apiKey, "saved-key");
    assert.equal(input.apiKey, "saved-key");
    assert.equal(apiKeyStatus(input).keySource, "saved");
  });
});

test("DeepSeek env key is used only when the saved key is empty", () => {
  withEnv({ DEEPSEEK_API_KEY: "env-deepseek", DEEPSTUDY_API_KEY: undefined }, () => {
    const input = settings({ apiKey: "   " });
    assert.equal(applyEnvApiKey(input).apiKey, "env-deepseek");
    assert.equal(apiKeyStatus(settings()).keySource, "env");
    const qwen = settings({
      provider: "qwen",
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
    });
    assert.equal(applyEnvApiKey(qwen).apiKey, "");
    assert.equal(apiKeyStatus(qwen).keySource, "none");
  });
});

test("DEEPSTUDY_API_KEY applies to the selected provider and outranks DEEPSEEK_API_KEY", () => {
  withEnv({ DEEPSEEK_API_KEY: "env-deepseek", DEEPSTUDY_API_KEY: "env-generic" }, () => {
    const qwen = settings({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/",
      model: "qwen-plus",
    });
    const resolved = applyEnvApiKey(qwen);
    assert.equal(resolved.apiKey, "env-generic");
    assert.equal(resolved.baseUrl.endsWith("/"), false);
    assert.equal(qwen.baseUrl.endsWith("/"), true);
  });
});

test("a custom DeepSeek base URL can read DEEPSEEK_API_KEY", () => {
  withEnv({ DEEPSEEK_API_KEY: "env-deepseek", DEEPSTUDY_API_KEY: undefined }, () => {
    const custom = settings({
      provider: "custom",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    assert.equal(applyEnvApiKey(custom).apiKey, "env-deepseek");
    assert.equal(apiKeyStatus(custom).hasKey, true);
  });
});
