"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookMarked, Highlighter, LoaderCircle, MessageSquareText, Pin, RefreshCw } from "lucide-react";
import { ArticleView } from "@/components/ArticleView";
import { ChatFloat } from "@/components/ChatFloat";
import { MessageBody } from "@/components/MessageBody";
import {
  PAGE_ZOOM_DEFAULT,
  PAGE_ZOOM_STEP,
  PageZoomControls,
  clampPageZoom,
  persistPageZoom,
  readStoredPageZoom,
} from "@/components/PageZoom";
import { SelectionMenu } from "@/components/SelectionMenu";
import { classifySelectionAsk, extractArticle, fetchArticle, refreshArticle, streamChat } from "@/lib/client";
import type { ArticleDetail, ChatMessage, KnowledgePoint } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function Reader({
  articleId,
  initial,
  initialKp,
}: {
  articleId: string;
  initial: ArticleDetail;
  initialKp?: string;
}) {
  const [detail, setDetail] = useState<ArticleDetail>(initial);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(initialKp ?? null);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatOpen, setChatOpen] = useState(() => Boolean(initialKp));
  const [kpsOpen, setKpsOpen] = useState(() => Boolean(initialKp));
  const [kpsPinned, setKpsPinned] = useState(false);
  const [openedIds, setOpenedIds] = useState<string[]>(() => (initialKp ? [initialKp] : []));
  const [streamingFor, setStreamingFor] = useState<string | null>(null);
  const [pageZoom, setPageZoom] = useState(PAGE_ZOOM_DEFAULT);

  useEffect(() => {
    setPageZoom(readStoredPageZoom());
  }, []);

  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target as Element | null;
      if (target?.closest(".chat-float, .reader-kps, .reader-topbar, .reader-history, .select-pop")) {
        return;
      }
      event.preventDefault();
      setPageZoom((current) => persistPageZoom(current + (event.deltaY < 0 ? PAGE_ZOOM_STEP : -PAGE_ZOOM_STEP)));
    }
    function onKey(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        setPageZoom((current) => persistPageZoom(current + PAGE_ZOOM_STEP));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setPageZoom((current) => persistPageZoom(current - PAGE_ZOOM_STEP));
      } else if (event.key === "0") {
        event.preventDefault();
        setPageZoom(persistPageZoom(PAGE_ZOOM_DEFAULT));
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setDetail(initial);
  }, [articleId, initial]);

  function changePageZoom(next: number) {
    setPageZoom(persistPageZoom(clampPageZoom(next)));
  }

  const load = useCallback(async () => {
    const next = await fetchArticle(articleId);
    setDetail(next);
    return next;
  }, [articleId]);

  useEffect(() => {
    if (!detail) return;
    setOpenedIds((ids) => {
      const keep = new Set([
        ...ids,
        ...detail.knowledgePoints.filter((item) => item.discussed).map((item) => item.id),
      ]);
      return detail.knowledgePoints.map((item) => item.id).filter((id) => keep.has(id));
    });
  }, [detail]);

  const active = detail?.knowledgePoints.find((item) => item.id === activeId) ?? null;
  const nameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const point of detail?.knowledgePoints ?? []) map[point.id] = point.name;
    return map;
  }, [detail]);

  async function runRefresh() {
    setRefreshing(true);
    setError("");
    try {
      const result = await refreshArticle(articleId);
      const latest = await load();
      const firstId = result.knowledgePoints[0]?.id ?? latest.knowledgePoints[0]?.id;
      if (firstId) {
        setActiveId(firstId);
        setOpenedIds((ids) => (ids.includes(firstId) ? ids : [...ids, firstId]));
        setChatOpen(true);
        setKpsOpen(true);
      }
      if (result.extractError) setError(result.extractError);
    } catch (item) {
      setError(item instanceof Error ? item.message : "重新抓取失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function runExtract() {
    setExtracting(true);
    setError("");
    try {
      await extractArticle(articleId);
      const latest = await load();
      if (latest.knowledgePoints[0]) {
        setActiveId(latest.knowledgePoints[0].id);
        setOpenedIds((ids) =>
          ids.includes(latest.knowledgePoints[0].id) ? ids : [...ids, latest.knowledgePoints[0].id],
        );
        setChatOpen(true);
        setKpsOpen(true);
      }
    } catch (item) {
      setError(item instanceof Error ? item.message : "抽取失败");
    } finally {
      setExtracting(false);
    }
  }

  function openPoint(id: string) {
    setActiveId(id);
    setOpenedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setChatOpen(true);
    setKpsOpen(true);
    setChatError("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("kp", id);
      url.hash = "reader-kps";
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  async function send(text: string, pointId = activeId, quote?: string, extraPoint?: KnowledgePoint) {
    const targetId = pointId;
    if (!targetId) return;
    setActiveId(targetId);
    setOpenedIds((ids) => (ids.includes(targetId) ? ids : [...ids, targetId]));
    setChatOpen(true);
    setKpsOpen(true);
    setStreamingFor(targetId);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: "pending",
      articleId,
      knowledgePointId: targetId,
      role: "user",
      content: quote ? `> ${quote}\n\n${text}` : text,
      mentionedKnowledgeIds: [],
      createdAt: new Date().toISOString(),
    };
    setDetail((current) => {
      if (!current) return current;
      const points =
        extraPoint && !current.knowledgePoints.some((item) => item.id === extraPoint.id)
          ? [...current.knowledgePoints, extraPoint]
          : current.knowledgePoints;
      return {
        ...current,
        messages: [...current.messages, optimistic],
        knowledgePoints: points.map((item) =>
          item.id === targetId ? { ...item, discussed: true, lastAskedAt: optimistic.createdAt } : item,
        ),
      };
    });
    setSending(true);
    setStreaming("");
    setChatError("");
    try {
      await streamChat({
        articleId,
        knowledgePointId: targetId,
        message: text,
        quote,
        onToken: (token) => setStreaming((value) => value + token),
      });
      const latest = await load();
      setDetail(latest);
      setStreaming("");
      setStreamingFor(null);
    } catch (item) {
      setChatError(item instanceof Error ? item.message : "提问失败");
      setStreaming("");
      setStreamingFor(null);
    } finally {
      setSending(false);
    }
  }

  async function askSelection(quote: string, question: string) {
    setSending(true);
    setChatError("");
    try {
      const matched = await classifySelectionAsk({ articleId, quote, question });
      await send(question, matched.knowledgePointId, quote, matched.point);
    } catch (item) {
      setChatError(item instanceof Error ? item.message : "提问失败");
    } finally {
      setSending(false);
    }
  }

  const discussed = detail.knowledgePoints.filter((item) => item.discussed);

  return (
    <div className="reader">
      <header className="reader-bar">
        <Link href="/" className="text-btn">
          <ArrowLeft size={16} /> 返回文库
        </Link>
        <div className="reader-title">
          <h1>{detail.article.title}</h1>
          <p>
            {detail.article.sourceType === "pdf" ? "PDF" : "网页"}
            {detail.article.pageCount > 1 ? ` · ${detail.article.pageCount} 页` : ""}
            {discussed.length ? ` · 已标注 ${discussed.length} 个问过的知识点` : ""}
          </p>
        </div>
        <PageZoomControls value={pageZoom} onChange={changePageZoom} />
        <PageZoomControls className="page-zoom-dock" value={pageZoom} onChange={changePageZoom} />
        {detail.article.sourceUrl ? (
          <button type="button" className="ghost-btn" onClick={runRefresh} disabled={refreshing}>
            {refreshing ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
            {refreshing ? "正在抓取并更新知识点…" : "重新抓取全文"}
          </button>
        ) : null}
        {detail.article.sourceType === "pdf" ? (
          <a className="ghost-btn" href={`/api/articles/${articleId}/file`} target="_blank" rel="noreferrer">
            下载 PDF
          </a>
        ) : detail.article.sourceUrl ? (
          <a className="ghost-btn" href={detail.article.sourceUrl} target="_blank" rel="noreferrer">
            打开原网页
          </a>
        ) : null}
        {!detail.article.extractedAt ? (
          <button type="button" className="primary-btn" onClick={runExtract} disabled={extracting}>
            {extracting ? <LoaderCircle size={16} className="spin" /> : <Highlighter size={16} />}
            {extracting ? "正在抽取知识点…" : "抽取并生成提问"}
          </button>
        ) : (
          <button type="button" className="ghost-btn" onClick={runExtract} disabled={extracting}>
            {extracting ? "重新抽取中…" : "重新抽取"}
          </button>
        )}
      </header>

      {error ? <p className="form-error reader-error">{error}</p> : null}
      {chatError && !activeId ? <p className="form-error reader-error">{chatError}</p> : null}

      <SelectionMenu onAsk={askSelection} asking={sending} />

      <ArticleView
        sourceType={detail.article.sourceType}
        fileUrl={detail.article.sourceType === "pdf" ? `/api/articles/${articleId}/file` : undefined}
        title={detail.article.title}
        html={detail.article.html}
        pageTexts={detail.article.pageTexts.length ? detail.article.pageTexts : [detail.article.text]}
        points={detail.knowledgePoints}
        activeId={activeId ?? undefined}
        pageZoom={pageZoom}
        onSelect={(id) => openPoint(id)}
      />

      <a
        href="#reader-kps"
        className="peek-right"
        aria-label="打开知识点"
        onMouseEnter={() => setKpsOpen(true)}
        onClick={() => setKpsOpen(true)}
      >
        <BookMarked size={14} />
        知识点
      </a>

      <aside
        id="reader-kps"
        className={cn("reader-kps", (kpsOpen || kpsPinned) && "open")}
        onMouseEnter={() => setKpsOpen(true)}
        onMouseLeave={() => {
          if (!kpsPinned) setKpsOpen(false);
        }}
      >
        <header>
          <div>
            <strong>基础知识点</strong>
            <span>点选后弹出问答浮层，可调透明度和大小。</span>
          </div>
          <button
            type="button"
            className={cn("ghost-btn", kpsPinned && "active")}
            onClick={() => setKpsPinned((value) => !value)}
          >
            <Pin size={14} />
            {kpsPinned ? "已固定" : "固定"}
          </button>
        </header>
        {detail.article.summary ? <p className="summary">{detail.article.summary}</p> : null}
        <div className="reader-kps-body">
          {!detail.knowledgePoints.length ? (
            <p className="muted">抽取后，研迹会先提出基础问题；你问过的知识点会在原文中用色块标出。</p>
          ) : (
            <ul className="reader-kps-list">
              {detail.knowledgePoints.map((point) => (
                <KnowledgeRow
                  key={point.id}
                  articleId={articleId}
                  point={point}
                  active={point.id === activeId}
                  onOpen={() => openPoint(point.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {chatOpen && active ? (
        <ChatFloat
          points={detail.knowledgePoints}
          activeId={active.id}
          openedIds={openedIds}
          messages={detail.messages}
          streaming={streaming}
          streamingFor={streamingFor}
          sending={sending}
          error={chatError}
          relatedNames={nameMap}
          onClose={() => setChatOpen(false)}
          onSelectPoint={openPoint}
          onSend={send}
        />
      ) : null}
    </div>
  );
}

function KnowledgeRow({
  articleId,
  point,
  active,
  onOpen,
}: {
  articleId: string;
  point: KnowledgePoint;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <a
        href={`/read/${articleId}?kp=${encodeURIComponent(point.id)}#reader-kps`}
        className={cn("kp-item", active && "active", point.discussed && "discussed")}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpen();
        }}
      >
        <span className="kp-name">
          {point.discussed ? <MessageSquareText size={14} /> : <span className="dot" />}
          <MessageBody text={point.name} compact />
        </span>
        <small>
          {point.category}
          {point.discussed && point.lastAskedAt ? ` · ${formatDate(point.lastAskedAt)}` : " · 未提问"}
        </small>
        <div className="kp-q">
          <MessageBody text={point.question} compact />
        </div>
      </a>
    </li>
  );
}
