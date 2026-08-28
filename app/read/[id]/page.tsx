import { notFound } from "next/navigation";
import { Reader } from "@/components/Reader";
import { ReaderShell } from "@/components/ReaderShell";
import { loadArticleView, loadLibraryCards } from "@/lib/load-article";
import { getSettings, publicSettings } from "@/lib/store";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importError?: string; saved?: string; settingsError?: string; kp?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [detail, settings, history] = await Promise.all([
    loadArticleView(id),
    getSettings(),
    loadLibraryCards(),
  ]);
  if (!detail) notFound();

  return (
    <div className="reader-root min-h-screen">
      <ReaderShell
        articleId={id}
        history={history}
        importError={query.importError}
        settingsMessage={query.saved === "1" ? "API 接口已保存到本机。" : query.saved}
        settingsError={query.settingsError}
        api={{ settings: publicSettings(settings), hasKey: Boolean(settings.apiKey) }}
      >
        <Reader articleId={id} initial={detail} initialKp={query.kp} />
      </ReaderShell>
    </div>
  );
}
