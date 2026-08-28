import Link from "next/link";
import { FileText, Link2, Trash2 } from "lucide-react";
import { deleteArticleAction } from "@/app/study-actions";
import { slimArticleBody } from "@/lib/slim-article";
import { arrangeLibrary } from "@/lib/library-layout";
import { getDb, listArticles } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";

export async function LibraryList() {
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
  const groups = arrangeLibrary(cards, db.knowledgePoints);

  if (!groups.length || !groups.some((group) => group.articles.length)) {
    return <p className="empty-hint">文库还是空的。导入第一篇文献后，知识谱才会开始生长。</p>;
  }

  return (
    <section className="library">
      <header className="library-head">
        <h2>最近研读</h2>
        <p>相近方向成组；组内先分理论 / 实验，再从左到右由浅入深。</p>
      </header>
      {groups.map((group) => (
        <div key={`${group.label}-${group.articles.map((item) => item.id).join("-")}`} className="library-group">
          <div className="library-group-head">
            <h3>{group.label}</h3>
            <span>由浅入深</span>
          </div>
          {(group.lanes?.length ? group.lanes : [{ kind: "mixed" as const, kindLabel: "", articles: group.articles }]).map(
            (lane) => (
              <div key={lane.kind + lane.kindLabel} className="library-lane">
                {lane.kindLabel ? <p className="library-lane-label">{lane.kindLabel}</p> : null}
                <div className="card-row">
                  {lane.articles.map((article) => (
                    <article key={article.id} className="paper-card">
                      <Link href={`/read/${article.id}`} className="card-main">
                        <span className="card-type">
                          {article.sourceType === "pdf" ? <FileText size={14} /> : <Link2 size={14} />}
                          {article.sourceType === "pdf" ? "PDF" : "链接"}
                          <i className={cn("depth-chip", article.depth)}>{article.depthLabel || "入门"}</i>
                          <i className={cn("kind-chip", article.kind || "mixed")}>{article.kindLabel || "理论+实验"}</i>
                        </span>
                        <h3>{article.title}</h3>
                        <p>{article.summary || "尚未抽取知识点"}</p>
                        <footer>
                          <span>
                            {article.discussedCount}/{article.knowledgeCount || 0} 个知识点已提问
                          </span>
                          <span>{formatDate(article.updatedAt)}</span>
                        </footer>
                      </Link>
                      <form action={deleteArticleAction}>
                        <input type="hidden" name="id" value={article.id} />
                        <button type="submit" className="icon-btn danger" aria-label="删除">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      ))}
    </section>
  );
}
