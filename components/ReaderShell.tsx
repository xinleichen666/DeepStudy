"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Pin } from "lucide-react";
import { ApiSettingsForm } from "@/components/ApiSettingsForm";
import { ImportPanel } from "@/components/ImportPanel";
import { openArticleWindow } from "@/lib/open-article-window";
import type { LibraryCard } from "@/lib/library-layout";
import type { Settings } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function ReaderShell({
  articleId,
  children,
  history = [],
  api,
  importError = "",
  settingsMessage = "",
  settingsError = "",
}: {
  articleId: string;
  children: React.ReactNode;
  history?: LibraryCard[];
  api?: { settings: Settings; hasKey: boolean };
  importError?: string;
  settingsMessage?: string;
  settingsError?: string;
}) {
  const [topOpen, setTopOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [topPinned, setTopPinned] = useState(false);
  const [sidePinned, setSidePinned] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  function openOther(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (id === articleId) {
      event.preventDefault();
      return;
    }
    const opened = openArticleWindow(id);
    if (opened) event.preventDefault();
  }

  const others = history.filter((item) => item.id !== articleId);

  return (
    <div className="reader-shell">
      <a
        href="#reader-import"
        className="peek-top"
        aria-label="打开导入与 API"
        onMouseEnter={() => setTopOpen(true)}
        onClick={() => setTopOpen(true)}
      >
        <ChevronDown size={14} />
        导入 / API
      </a>
      <a
        href="#reader-history"
        className="peek-left"
        aria-label="打开历史文章"
        onMouseEnter={() => setSideOpen(true)}
        onClick={() => setSideOpen(true)}
      >
        <FolderOpen size={14} />
        历史
      </a>

      <aside
        id="reader-import"
        className={cn("reader-topbar", (topOpen || topPinned) && "open")}
        onMouseEnter={() => setTopOpen(true)}
        onMouseLeave={() => {
          if (!topPinned) setTopOpen(false);
        }}
      >
        <header>
          <div>
            <strong>导入与接口</strong>
            <span>当前文保持打开；新文章会在新窗口铺满可用屏幕。</span>
          </div>
          <button
            type="button"
            className={cn("ghost-btn", topPinned && "active")}
            onClick={() => setTopPinned((value) => !value)}
          >
            <Pin size={14} />
            {topPinned ? "已固定" : "固定"}
          </button>
        </header>
        <div className="reader-topbar-grid">
          <ApiSettingsForm
            compact
            back={`/read/${articleId}`}
            initial={api}
            message={settingsMessage}
            error={settingsError}
          />
          <ImportPanel compact back={`/read/${articleId}`} error={importError} />
        </div>
      </aside>

      <aside
        id="reader-history"
        className={cn("reader-history", (sideOpen || sidePinned) && "open")}
        onMouseEnter={() => setSideOpen(true)}
        onMouseLeave={() => {
          if (!sidePinned && !dragging) setSideOpen(false);
        }}
      >
        <header>
          <div>
            <strong>历史文章</strong>
            <span>点选或拖到正文，拉出新窗口。</span>
          </div>
          <button
            type="button"
            className={cn("ghost-btn", sidePinned && "active")}
            onClick={() => setSidePinned((value) => !value)}
          >
            <Pin size={14} />
            {sidePinned ? "已固定" : "固定"}
          </button>
        </header>
        {others.length ? (
          <ul>
            {others.map((article) => (
              <li key={article.id}>
                <a
                  href={`/read/${article.id}`}
                  className="history-item"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-deepstudy-article", article.id);
                    event.dataTransfer.setData("text/plain", article.id);
                    event.dataTransfer.effectAllowed = "copy";
                    setDragging(article.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={(event) => openOther(event, article.id)}
                >
                  <b>{article.title}</b>
                  <small>
                    {article.sourceType === "pdf" ? "PDF" : "网页"}
                    {article.kindLabel ? ` · ${article.kindLabel}` : ""}
                    {article.depthLabel ? ` · ${article.depthLabel}` : ""}
                    {` · ${article.discussedCount}/${article.knowledgeCount || 0} 已提问`}
                  </small>
                  <em>{article.summary || "尚未抽取摘要"}</em>
                  <span>{formatDate(article.updatedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">还没有其他文章。可从上方导入，导入后会开新窗口。</p>
        )}
      </aside>

      {dragging ? (
        <div
          className="detach-drop"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id =
              event.dataTransfer.getData("application/x-deepstudy-article") ||
              event.dataTransfer.getData("text/plain");
            setDragging(null);
            if (id && id !== articleId) {
              const opened = openArticleWindow(id);
              if (!opened) window.location.href = `/read/${id}`;
            }
          }}
        >
          松开鼠标，在新窗口打开这篇文章
        </div>
      ) : null}

      <a
        href="#reader-stage"
        className="peek-close-top"
        hidden={!(topOpen || topPinned)}
        onClick={() => {
          setTopOpen(false);
          setTopPinned(false);
        }}
        aria-label="收起上边栏"
      >
        <ChevronUp size={14} />
      </a>

      <div id="reader-stage">{children}</div>
    </div>
  );
}
