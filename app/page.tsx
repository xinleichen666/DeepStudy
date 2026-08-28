import { AppShell } from "@/components/AppShell";
import { ApiSettingsForm } from "@/components/ApiSettingsForm";
import { ImportPanel } from "@/components/ImportPanel";
import { LibraryList } from "@/components/LibraryList";
import { getSettings, publicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function savedMessage(saved?: string) {
  if (!saved) return "";
  return saved === "1" ? "API 接口已保存到本机。" : saved;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ importError?: string; saved?: string; settingsError?: string }>;
}) {
  const query = await searchParams;
  const settings = await getSettings();
  return (
    <AppShell active="library">
      <div className="page-pad">
        <header className="hero">
          <p className="kicker">研究生自学 · 个人知识可追溯</p>
          <h1>把一篇文献读成可以反复回来的问题。</h1>
          <p className="lede">
            导入链接或 PDF，研迹会抽出基础知识点并向你提问；你问过的概念会写回原文。下次打开，点击标注即可接上当时的对话。
          </p>
        </header>
        <ApiSettingsForm
          compact
          back="/"
          initial={{ settings: publicSettings(settings), hasKey: Boolean(settings.apiKey) }}
          message={savedMessage(query.saved)}
          error={query.settingsError}
        />
        <ImportPanel back="/" error={query.importError} />
        <LibraryList />
      </div>
    </AppShell>
  );
}
