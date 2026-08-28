import type { ProviderId, Settings } from "./types";

export type ProviderOption = {
  id: ProviderId;
  name: string;
  hint: string;
  baseUrl: string;
  models: string[];
  keyUrl: string;
};

export const PROVIDERS: ProviderOption[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    hint: "性价比高，适合长文抽取与持续问答",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "qwen",
    name: "通义千问",
    hint: "阿里云 DashScope 兼容模式",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
    keyUrl: "https://bailian.console.aliyun.com/",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    hint: "清华系大模型，学术中文表现稳定",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash", "glm-4-plus", "glm-4.5-flash", "glm-4.5"],
    keyUrl: "https://open.bigmodel.cn/",
  },
  {
    id: "moonshot",
    name: "Kimi / 月之暗面",
    hint: "长上下文，适合论文精读",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["kimi-k2-0905-preview", "moonshot-v1-auto", "moonshot-v1-128k"],
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "doubao",
    name: "豆包 / 火山引擎",
    hint: "模型名需填写接入点 ID（ep-...）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [],
    keyUrl: "https://console.volcengine.com/ark",
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    hint: "任何 OpenAI Chat Completions 兼容网关",
    baseUrl: "",
    models: [],
    keyUrl: "",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
};

export function getProvider(id: ProviderId) {
  return PROVIDERS.find((item) => item.id === id) ?? PROVIDERS[0];
}

export function resolveSettings(settings: Settings) {
  const provider = getProvider(settings.provider);
  const baseUrl = (settings.baseUrl || provider.baseUrl).replace(/\/+$/, "");
  const model = settings.model || provider.models[0] || "";
  return { ...settings, baseUrl, model };
}
