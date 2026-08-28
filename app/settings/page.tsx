import { AppShell } from "@/components/AppShell";
import { ApiSettingsForm } from "@/components/ApiSettingsForm";
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
  return (
    <AppShell active="settings">
      <div className="page-pad narrow">
        <header className="hero compact">
          <p className="kicker">API 接口</p>
          <h1>把国内模型接到研迹。</h1>
          <p className="lede">
            使用 OpenAI 兼容协议。Key 只写在本机 data 目录，请求只会发往你填写的接口地址。
          </p>
        </header>
        <ApiSettingsForm
          back="/settings"
          initial={{ settings: publicSettings(settings), hasKey: Boolean(settings.apiKey) }}
          message={savedMessage(query.saved)}
          error={query.settingsError}
        />
      </div>
    </AppShell>
  );
}
