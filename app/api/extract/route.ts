import { jsonError, jsonOk, readBody } from "@/lib/http";
import { extractKnowledge } from "@/lib/llm";
import { getArticleDetail, getSettings, replaceKnowledgePoints, updateArticleMeta } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { articleId } = await readBody<{ articleId?: string }>(request);
    if (!articleId) return jsonError(new Error("缺少文章 ID"));
    const detail = await getArticleDetail(articleId);
    if (!detail) return jsonError(new Error("文章不存在"));
    const settings = await getSettings();
    const extracted = await extractKnowledge(settings, detail.article);
    await updateArticleMeta(articleId, {
      title: detail.article.title === "未命名文献" || detail.article.sourceType === "pdf"
        ? extracted.title
        : detail.article.title,
      summary: extracted.summary,
    });
    const knowledgePoints = await replaceKnowledgePoints(articleId, extracted.knowledgePoints);
    const latest = await getArticleDetail(articleId);
    return jsonOk({
      article: latest?.article ?? detail.article,
      knowledgePoints,
      summary: extracted.summary,
    });
  } catch (error) {
    return jsonError(error);
  }
}
