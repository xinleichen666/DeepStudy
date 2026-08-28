"use client";

import { saveSettingsAction, testSettingsAction } from "@/app/study-actions";
import { PROVIDERS } from "@/lib/providers";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ApiSettingsForm({
  compact = false,
  back = "/settings",
  initial,
  message = "",
  error = "",
}: {
  compact?: boolean;
  back?: string;
  initial?: { settings: Settings; hasKey: boolean };
  message?: string;
  error?: string;
}) {
  const form = initial?.settings;
  const hasKey = initial?.hasKey ?? false;
  if (!form) {
    return <p className="muted">正在读取 API 配置…</p>;
  }
  const provider = PROVIDERS.find((item) => item.id === form.provider);

  const fields = (
    <form className="settings-form nested" action={saveSettingsAction}>
      <input type="hidden" name="back" value={back} />
      <label>
        模型服务
        <select name="provider" defaultValue={form.provider}>
          {PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <small>{provider?.hint}</small>
      </label>

      <div className="api-grid">
        <label>
          接口地址
          <input name="baseUrl" defaultValue={form.baseUrl} placeholder="https://api.deepseek.com/v1" />
        </label>
        <label>
          模型名
          <input name="model" defaultValue={form.model} placeholder="deepseek-chat" list="models" />
          <datalist id="models">
            {(provider?.models ?? []).map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
      </div>

      <label>
        API Key {hasKey ? <em>已保存</em> : <em>未填写</em>}
        <input
          type="password"
          name="apiKey"
          defaultValue={form.apiKey}
          placeholder={hasKey ? "留空则保持原 Key" : "sk-..."}
          autoComplete="off"
        />
        {provider?.keyUrl ? (
          <small>
            申请地址：
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">
              {provider.keyUrl}
            </a>
          </small>
        ) : null}
      </label>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      <div className="row-actions">
        <button type="submit" className="primary-btn">
          保存接口
        </button>
        <button type="submit" className="ghost-btn" formAction={testSettingsAction}>
          测试连通
        </button>
      </div>
    </form>
  );

  return (
    <section className={cn("api-card", compact && "compact")}>
      <header className="api-head">
        <div>
          <p className="kicker">模型 API 接口</p>
          <h2>接入国内大模型</h2>
          <p>
            {hasKey
              ? `已连接 ${provider?.name ?? "自定义接口"} · ${form.model}`
              : "先填写接口地址和 Key，研迹才能抽知识点并回答提问。"}
          </p>
        </div>
      </header>
      {compact ? (
        <details className="api-details" open={!hasKey}>
          <summary className="ghost-btn">{hasKey ? "更改接口" : "配置接口"}</summary>
          {fields}
        </details>
      ) : (
        fields
      )}
    </section>
  );
}
