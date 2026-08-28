"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { fetchKnowledge } from "@/lib/client";
import type { KnowledgeTraceItem } from "@/lib/types";
import { excerptSnippet, formatDate } from "@/lib/utils";

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeTraceItem[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchKnowledge()
      .then((data) => setItems(data.items))
      .catch((item) => setError(item instanceof Error ? item.message : "读取失败"));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((item) =>
      [item.point.name, item.point.definition, item.article.title, ...item.messages.map((msg) => msg.content)]
        .join("\n")
        .includes(q),
    );
  }, [items, query]);

  return (
    <AppShell active="knowledge">
      <div className="page-pad">
        <header className="hero compact">
          <p className="kicker">个人知识谱</p>
          <h1>追溯你问过的每一个概念。</h1>
          <p className="lede">
            这里按知识点收束全部历史对话。点回原文时，问过的概念会留在文章画面上，点击即可接着问。
          </p>
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索知识点、原文标题或对话内容"
          />
        </header>
        {error ? <p className="form-error">{error}</p> : null}
        {!filtered.length ? (
          <p className="empty-hint">还没有可追溯的提问。先去文库导入一篇文章，并围绕知识点对话。</p>
        ) : (
          <div className="trace-list">
            {filtered.map((item) => (
              <article key={item.point.id} className="trace-card">
                <div className="trace-head">
                  <div>
                    <p className="kicker">{item.point.category}</p>
                    <h2>{item.point.name}</h2>
                  </div>
                  <Link href={`/read/${item.article.id}?kp=${item.point.id}`} className="ghost-btn">
                    回到原文标注
                  </Link>
                </div>
                <p className="trace-from">出自《{item.article.title}》</p>
                <p>{item.point.definition}</p>
                {item.related.length ? (
                  <p className="related">
                    对话中还提到：
                    {item.related.map((related) => (
                      <Link key={related.id} href={`/read/${related.articleId}?kp=${related.id}`}>
                        {related.name}
                      </Link>
                    ))}
                  </p>
                ) : null}
                <ol className="mini-log">
                  {item.messages.slice(-4).map((message) => (
                    <li key={message.id}>
                      <strong>{message.role === "user" ? "我" : "研迹"}</strong>
                      <span>{excerptSnippet(message.content, 90)}</span>
                      <time>{formatDate(message.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
