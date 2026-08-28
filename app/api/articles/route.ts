import { jsonError, jsonOk } from "@/lib/http";
import { slimArticleBody } from "@/lib/slim-article";
import { arrangeLibrary } from "@/lib/library-layout";
import { getDb, listArticles } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [articles, db] = await Promise.all([listArticles(), getDb()]);
    const cards = articles.map((article) => {
      const points = db.knowledgePoints.filter((item) => item.articleId === article.id);
      const discussed = points.filter((item) => item.discussed).length;
      return slimArticleBody({
        ...article,
        knowledgeCount: points.length,
        discussedCount: discussed,
        messageCount: db.messages.filter((item) => item.articleId === article.id).length,
      });
    });
    const groups = arrangeLibrary(cards, db.knowledgePoints);
    return jsonOk({ articles: groups.flatMap((group) => group.articles), groups });
  } catch (error) {
    return jsonError(error);
  }
}
