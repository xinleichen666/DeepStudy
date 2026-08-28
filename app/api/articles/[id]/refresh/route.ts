import { jsonError, jsonOk } from "@/lib/http";
import { ingestUrl } from "@/lib/ingest";
import { extractKnowledge } from "@/lib/llm";
import {
  getArticleDetail,
  getSettings,
  replaceArticleContent,
  replaceKnowledgePoints,
  saveUpload,
  updateArticleMeta,
  updateDb,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const detail = await getArticleDetail(id);
    if (!detail) return jsonError(new Error("文章不存在"));
    if (!detail.article.sourceUrl) {
      return jsonError(new Error("这篇文章没有原始链接，无法重新抓取"));
    }
    const extracted = await ingestUrl(detail.article.sourceUrl);
    const article = await replaceArticleContent(id, {
      title: extracted.title || detail.article.title,
      sourceType: extracted.mimeType === "application/pdf" ? "pdf" : "url",
      fileName: extracted.fileName,
      mimeType: extracted.mimeType,
      text: extracted.text,
      html: extracted.html,
      pageTexts: extracted.pageTexts,
      pageCount: extracted.pageCount,
      extractedAt: undefined,
    });
    if (extracted.pdfBuffer) {
      const file = new File([new Uint8Array(extracted.pdfBuffer)], extracted.fileName || "article.pdf", {
        type: "application/pdf",
      });
      await saveUpload(id, file);
      await updateDb((db) => {
        const item = db.articles.find((row) => row.id === id);
        if (item) {
          item.sourceType = "pdf";
          item.fileName = extracted.fileName;
        }
      });
    }

    let knowledgePoints = [] as Awaited<ReturnType<typeof replaceKnowledgePoints>>;
    let extractError = "";
    try {
      const settings = await getSettings();
      const latest = await getArticleDetail(id);
      if (!latest) throw new Error("文章不存在");
      const knowledge = await extractKnowledge(settings, latest.article);
      await updateArticleMeta(id, {
        title: latest.article.title,
        summary: knowledge.summary,
      });
      knowledgePoints = await replaceKnowledgePoints(id, knowledge.knowledgePoints);
    } catch (error) {
      extractError = error instanceof Error ? error.message : "全文已更新，但知识点重抽失败，请再点「重新抽取」";
    }

    const next = await getArticleDetail(id);
    return jsonOk({
      article: next?.article ?? article,
      knowledgePoints,
      extractError: extractError || undefined,
    });
  } catch (error) {
    return jsonError(error);
  }
}
