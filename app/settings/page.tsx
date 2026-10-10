import { AppShell } from "@/components/AppShell";
import { ApiSettingsForm } from "@/components/ApiSettingsForm";
import { apiKeyStatus } from "@/lib/api-key";
import { resolveSettings } from "@/lib/providers";
import { getSettings, publicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

function savedMessage(saved?: string) {
  if (!saved) return "";
  return saved === "1" ? "API 接口已保存到本机。" : saved;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; settingsError?: string }>;
}) {
  const query = await searchParams;
  const settings = await getSettings();
  const key = apiKeyStatus(resolveSettings(settings));
  return (
    <AppShell active="settings">
      <div className="page-pad narrow">
        <header className="hero compact">
          <p className="kicker">API 接口</p>
          <h1>把国内模型接到研迹。</h1>
          <p className="lede">
            使用 OpenAI 兼容协议，默认 DeepSeek（https://api.deepseek.com/v1，模型 deepseek-chat）。Key 写在本机，或用环境变量 DEEPSEEK_API_KEY / DEEPSTUDY_API_KEY，不会进仓库。
          </p>
        </header>
        <ApiSettingsForm
          back="/settings"
          initial={{ settings: publicSettings(settings), hasKey: key.hasKey, keySource: key.keySource }}
          message={savedMessage(query.saved)}
          error={query.settingsError}
        />
      </div>
    </AppShell>
  );
}
