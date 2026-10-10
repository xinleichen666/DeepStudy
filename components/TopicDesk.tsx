"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { MessageBody } from "@/components/MessageBody";
import {
  createTopicRequest,
  deleteTopicRequest,
  fetchSettings,
  fetchTopic,
  fetchTopics,
  regenerateTopicRequest,
  streamTopicChat,
} from "@/lib/client";
import { PROVIDERS } from "@/lib/providers";
import type { TopicDetail, TopicListItem, TopicMessage } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const EXAMPLE = "薄膜铌酸锂偏振分束旋转器逆向设计";

const PROMPTS = [
  "这个方向现在最难的瓶颈是什么？",
  "如果做逆向设计，优化目标和约束通常怎么取？",
  "文库里已有的论文覆盖了课题的哪一块？",
];

export function TopicDesk() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id") || "";
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [activeId, setActiveId] = useState(requestedId);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState("");
  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [chatError, setChatError] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState("deepseek-chat");
  const endRef = useRef<HTMLDivElement>(null);
  const detailRequest = useRef(0);

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setHasKey(data.hasKey);
        const provider = PROVIDERS.find((item) => item.id === data.settings.provider);
        setModelLabel(`${provider?.name ?? "模型"} · ${data.settings.model || "deepseek-chat"}`);
      })
      .catch(() => setHasKey(false));
  }, []);

  async function loadDetail(id: string) {
    const ticket = detailRequest.current + 1;
    detailRequest.current = ticket;
    if (!id) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }
    setLoadingDetail(true);
    setChatError("");
    try {
      const data = await fetchTopic(id);
      if (detailRequest.current === ticket) setDetail(data);
    } catch (error) {
      if (detailRequest.current === ticket) {
        setDetail(null);
        setFormError(error instanceof Error ? error.message : "课题读取失败");
      }
    } finally {
      if (detailRequest.current === ticket) setLoadingDetail(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchTopics()
      .then((data) => {
        if (cancelled) return;
        setTopics(data.topics);
        const chosen = data.topics.some((item) => item.id === requestedId)
          ? requestedId
          : data.topics[0]?.id || "";
        setActiveId(chosen);
        if (chosen && chosen !== requestedId) {
          router.replace(`/topics?id=${encodeURIComponent(chosen)}`, { scroll: false });
        }
        return chosen;
      })
      .then((chosen) => {
        if (cancelled || chosen === undefined) return;
        return loadDetail(chosen);
      })
      .catch((error) => {
        if (!cancelled) setListError(error instanceof Error ? error.message : "课题读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, pending]);

  function selectTopic(id: string) {
    setActiveId(id);
    setConfirmId("");
    const path = id ? `/topics?id=${encodeURIComponent(id)}` : "/topics";
    router.replace(path, { scroll: false });
    void loadDetail(id);
  }

  async function refreshList() {
    const data = await fetchTopics();
    setTopics(data.topics);
    return data.topics;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (next.length < 2 || creating) return;
    setCreating(true);
    setFormError("");
    try {
      const result = await createTopicRequest(next);
      setTitle("");
      await refreshList();
      selectTopic(result.topic.id);
      if (result.error) setFormError(result.error);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "生成失败");
    } finally {
      setCreating(false);
    }
  }

  async function onRegenerate() {
    if (!detail || creating) return;
    setCreating(true);
    setFormError("");
    try {
      await regenerateTopicRequest(detail.topic.id);
      await refreshList();
      await loadDetail(detail.topic.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "重新生成失败");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    setFormError("");
    try {
      await deleteTopicRequest(id);
      const next = (await refreshList()).filter((item) => item.id !== id);
      selectTopic(next[0]?.id || "");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function ask(text: string) {
    const message = text.trim();
    if (!detail?.topic.overview || !message || asking) return;
    const topicId = detail.topic.id;
    setAsking(true);
    setChatError("");
    setQuestion("");
    setPending("");
    const optimistic: TopicMessage = {
      id: `local-user-${detail.messages.length}`,
      topicId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    setDetail((current) =>
      current && current.topic.id === topicId ? { ...current, messages: [...current.messages, optimistic] } : current,
    );
    try {
      await streamTopicChat({
        topicId,
        message,
        onToken: (token) => setPending((value) => value + token),
      });
      const fresh = await fetchTopic(topicId);
      setDetail((current) => (current && current.topic.id === topicId ? fresh : current));
      setPending("");
      await refreshList();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "提问失败");
      const fresh = await fetchTopic(topicId).catch(() => null);
      if (fresh) setDetail((current) => (current && current.topic.id === topicId ? fresh : current));
    } finally {
      setAsking(false);
    }
  }

  const overview = detail?.topic.overview;

  return (
    <div className="page-pad topic-page">
      <header className="hero compact">
        <p className="kicker">课题知识</p>
        <h1>把研究方向收成一张可以追问的地图。</h1>
        <p className="lede">
          写下课题后，研迹按背景、概念、方法、现状、开放问题和阅读线索整理一版概览，并接着这个课题对话。文库里对得上的论文会作为上下文。当前模型：{modelLabel}。
        </p>
      </header>

      {hasKey === false ? (
        <p className="form-error">
          还没有可用的 API Key。请先到 <Link href="/settings">API</Link> 填写 DeepSeek Key，或在环境变量中设置 DEEPSEEK_API_KEY。Key 只留在本机。
        </p>
      ) : null}
      {listError ? <p className="form-error">{listError}</p> : null}

      <div className="topic-layout">
        <aside className="topic-side">
          <form className="topic-compose" onSubmit={onCreate}>
            <label>
              研究方向
              <textarea
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={EXAMPLE}
                rows={4}
                maxLength={80}
              />
            </label>
            <div className="row-actions">
              <button className="primary-btn" type="submit" disabled={creating || title.trim().length < 2 || hasKey === false}>
                {creating ? "正在生成…" : "生成概览"}
              </button>
              <button className="ghost-btn" type="button" onClick={() => setTitle(EXAMPLE)} disabled={creating}>
                填入示例
              </button>
            </div>
          </form>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="topic-list">
            {loadingList ? <p className="muted">正在读取课题…</p> : null}
            {!loadingList && !topics.length ? <p className="muted">还没有课题。</p> : null}
            {topics.map((item) => (
              <div key={item.id} className={item.id === activeId ? "topic-item active" : "topic-item"}>
                <button type="button" className="topic-item-main" onClick={() => selectTopic(item.id)}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.hasOverview ? "已有概览" : "待生成"} · {item.messageCount} 条对话 · {formatDate(item.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={confirmId === item.id ? "确认删除课题" : "删除课题"}
                  onClick={() => {
                    if (confirmId === item.id) void onDelete(item.id);
                    else setConfirmId(item.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="topic-main">
          {!activeId && !loadingList ? (
            <p className="empty-hint">先在左侧写下研究方向，例如「{EXAMPLE}」。</p>
          ) : null}
          {loadingDetail && !detail ? <p className="muted">正在打开课题…</p> : null}
          {detail ? (
            <>
              <header className="topic-head">
                <div>
                  <p className="kicker">当前课题</p>
                  <h2>{detail.topic.title}</h2>
                </div>
                <button className="ghost-btn" type="button" onClick={() => void onRegenerate()} disabled={creating || hasKey === false}>
                  <RefreshCw size={16} />
                  {creating ? "正在生成…" : overview ? "重新生成" : "生成概览"}
                </button>
              </header>

              {overview ? (
                <div className="topic-grid">
                  <article className="topic-block topic-prose">
                    <p className="kicker">背景</p>
                    <MessageBody text={overview.background} />
                  </article>
                  <article className="topic-block topic-prose">
                    <p className="kicker">研究现状</p>
                    <MessageBody text={overview.stateOfArt || "概览里没有单列现状。"} />
                  </article>
                  <article className="topic-block topic-prose">
                    <p className="kicker">核心概念</p>
                    <ul className="topic-defs">
                      {overview.concepts.map((item) => (
                        <li key={item.name}>
                          <strong>{item.name}</strong>
                          <MessageBody text={item.principle} />
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article className="topic-block topic-prose">
                    <p className="kicker">关键方法</p>
                    {overview.methods.length ? (
                      <ul className="topic-defs">
                        {overview.methods.map((item) => (
                          <li key={item.name}>
                            <strong>{item.name}</strong>
                            <MessageBody text={item.summary} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">概览里没有单列方法。</p>
                    )}
                  </article>
                  <article className="topic-block topic-prose">
                    <p className="kicker">开放问题</p>
                    {overview.openProblems.length ? (
                      <ol className="topic-questions">
                        {overview.openProblems.map((item) => (
                          <li key={item}>
                            <MessageBody text={item} />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">概览里没有单列开放问题。</p>
                    )}
                  </article>
                  <article className="topic-block topic-prose">
                    <p className="kicker">推荐阅读与关键词</p>
                    <ul className="topic-reading">
                      {overview.reading.map((item) => (
                        <li key={item.title}>
                          <strong>{item.title}</strong>
                          {item.why ? <MessageBody text={item.why} /> : null}
                        </li>
                      ))}
                    </ul>
                    {overview.keywords.length ? (
                      <p className="topic-keywords">
                        {overview.keywords.map((word) => (
                          <span key={word}>{word}</span>
                        ))}
                      </p>
                    ) : null}
                  </article>
                  <article className="topic-block">
                    <p className="kicker">文库对照</p>
                    {detail.articles.length ? (
                      <ul className="topic-papers">
                        {detail.articles.map((article) => (
                          <li key={article.id}>
                            <Link href={`/read/${article.id}`}>{article.title}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">文库里还没有明显对得上的论文。导入相关文献后可以重新生成。</p>
                    )}
                  </article>
                </div>
              ) : (
                <p className="empty-hint">这个课题还没有概览。确认 API Key 后点「生成概览」。</p>
              )}

              <section className="topic-chat">
                <p className="kicker">接着问</p>
                <div className="topic-log">
                  {detail.messages.map((message) => (
                    <article key={message.id} className={message.role === "user" ? "topic-bubble user" : "topic-bubble"}>
                      <span>{message.role === "user" ? "我" : "研迹"}</span>
                      <MessageBody text={message.content} />
                    </article>
                  ))}
                  {pending ? (
                    <article className="topic-bubble">
                      <span>研迹</span>
                      <MessageBody text={pending} />
                    </article>
                  ) : null}
                  <div ref={endRef} />
                </div>
                {chatError ? <p className="form-error">{chatError}</p> : null}
                <div className="topic-prompts">
                  {PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" disabled={!overview || asking} onClick={() => void ask(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
                <form
                  className="topic-ask"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void ask(question);
                  }}
                >
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={overview ? "顺着这个课题追问" : "生成概览后可以追问"}
                    rows={3}
                    disabled={!overview || asking}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void ask(question);
                      }
                    }}
                  />
                  <button className="primary-btn" type="submit" disabled={!overview || asking || !question.trim()}>
                    <Send size={16} />
                    {asking ? "回答中" : "发送"}
                  </button>
                </form>
              </section>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
