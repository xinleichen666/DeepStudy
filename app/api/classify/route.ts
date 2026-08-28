import { jsonError, jsonOk, readBody } from "@/lib/http";
import { classifySelection } from "@/lib/llm";
import { addKnowledgePoint, getArticleDetail, getSettings } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readBody<{
      articleId?: string;
      quote?: string;
      question?: string;
    }>(request);
    const quote = body.quote?.replace(/\s+/g, " ").trim() || "";
    const question = body.question?.trim() || "";
    if (!body.articleId || !quote || !question) {
      return jsonError(new Error("请先划选原文并写下问题"));
    }
    const detail = await getArticleDetail(body.articleId);
    if (!detail) return jsonError(new Error("文章不存在"));
    const settings = await getSettings();
    const matched = await classifySelection(
      settings,
      detail.article,
      detail.knowledgePoints,
      quote,
      question,
    );
    if (matched.match === "existing") {
      return jsonOk({
        knowledgePointId: matched.knowledgePointId,
        name: matched.name,
        reason: matched.reason,
        created: false,
      });
    }
    const point = await addKnowledgePoint(body.articleId, matched.created);
    return jsonOk({
      knowledgePointId: point.id,
      name: point.name,
      reason: matched.reason,
      created: true,
      point,
    });
  } catch (error) {
    return jsonError(error);
  }
}
