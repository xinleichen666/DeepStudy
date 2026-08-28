import { rewriteHtmlForDisplay } from "@/lib/html";
import { arrangeLibrary, type LibraryCard } from "@/lib/library-layout";
import { slimArticleBody } from "@/lib/slim-article";
import { getArticleDetail, getDb, listArticles } from "@/lib/store";

export { slimArticleBody };

export async function loadArticleView(id: string) {
  const detail = await getArticleDetail(id);
  if (!detail) return null;
  if (!detail.article.html) return detail;
  return {
    ...detail,
    article: {
      ...detail.article,
      html: rewriteHtmlForDisplay(detail.article.html, detail.article.sourceUrl),
    },
  };
}

export async function loadLibraryCards(): Promise<LibraryCard[]> {
  const [articles, db] = await Promise.all([listArticles(), getDb()]);
  const cards = articles.map((article) => {
    const points = db.knowledgePoints.filter((item) => item.articleId === article.id);
    return slimArticleBody({
      ...article,
      knowledgeCount: points.length,
      discussedCount: points.filter((item) => item.discussed).length,
      messageCount: db.messages.filter((item) => item.articleId === article.id).length,
    });
  });
  return arrangeLibrary(cards, db.knowledgePoints).flatMap((group) => group.articles);
}
