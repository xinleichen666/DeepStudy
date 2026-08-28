import { ingestPdfBuffer, ingestUrl } from "@/lib/ingest";
import { extractKnowledge } from "@/lib/llm";
import {
  createArticle,
  getArticleDetail,
  getSettings,
  replaceKnowledgePoints,
  saveUpload,
  updateArticleMeta,
  updateDb,
} from "@/lib/store";
import type { Article } from "@/lib/types";

export async function saveImportedUrl(url: string): Promise<Article> {
  const extracted = await ingestUrl(url);
  const article = await createArticle({
    title: extracted.title,
    sourceType: extracted.mimeType === "application/pdf" ? "pdf" : "url",
    sourceUrl: extracted.sourceUrl,
    fileName: extracted.fileName,
    mimeType: extracted.mimeType,
    text: extracted.text,
    html: extracted.html,
    pageTexts: extracted.pageTexts,
    pageCount: extracted.pageCount,
  });
  if (extracted.pdfBuffer) {
    const file = new File([new Uint8Array(extracted.pdfBuffer)], extracted.fileName || "article.pdf", {
      type: "application/pdf",
    });
    await saveUpload(article.id, file);
    await updateDb((db) => {
      const item = db.articles.find((row) => row.id === article.id);
      if (item) {
        item.sourceType = "pdf";
        item.fileName = extracted.fileName;
      }
    });
  }
  return article;
}

export async function saveImportedPdf(file: File): Promise<Article> {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("目前仅支持 PDF 文件");
  }
  const extracted = await ingestPdfBuffer(Buffer.from(await file.arrayBuffer()), file.name);
  const article = await createArticle({
    title: extracted.title,
    sourceType: "pdf",
    fileName: file.name,
    mimeType: "application/pdf",
    text: extracted.text,
    pageTexts: extracted.pageTexts,
    pageCount: extracted.pageCount,
  });
  await saveUpload(article.id, file);
  return article;
}

export async function extractIfPossible(articleId: string) {
  const detail = await getArticleDetail(articleId);
  if (!detail) return;
  const settings = await getSettings();
  if (!settings.apiKey.trim()) return;
  const extracted = await extractKnowledge(settings, detail.article);
  await updateArticleMeta(articleId, {
    title:
      detail.article.title === "未命名文献" || detail.article.sourceType === "pdf"
        ? extracted.title
        : detail.article.title,
    summary: extracted.summary,
  });
  await replaceKnowledgePoints(articleId, extracted.knowledgePoints);
}
