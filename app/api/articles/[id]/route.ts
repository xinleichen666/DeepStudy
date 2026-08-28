import { jsonError, jsonOk } from "@/lib/http";
import { loadArticleView } from "@/lib/load-article";
import { deleteArticle } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const detail = await loadArticleView(id);
    if (!detail) return jsonError(new Error("文章不存在"), "文章不存在");
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await deleteArticle(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
