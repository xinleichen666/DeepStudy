import { readJson } from "./utils";
import type { LibraryCard, LibraryGroup } from "./library-layout";
import type {
  Article,
  ArticleDetail,
  KnowledgePoint,
  KnowledgeTraceItem,
  Settings,
} from "./types";

export type ArticleCard = LibraryCard;

export async function fetchArticles() {
  const data = await readJson<{ articles: ArticleCard[]; groups: LibraryGroup[] }>(await fetch("/api/articles"));
  return data;
}

export async function fetchArticle(id: string) {
  return readJson<ArticleDetail>(await fetch(`/api/articles/${id}`));
}

export async function ingestUrl(url: string) {
  return readJson<{ article: Article }>(
    await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}

export async function ingestPdf(file: File) {
  const form = new FormData();
  form.append("file", file);
  return readJson<{ article: Article }>(await fetch("/api/ingest", { method: "POST", body: form }));
}

export async function extractArticle(articleId: string) {
  return readJson<{ article: Article; knowledgePoints: KnowledgePoint[]; summary: string }>(
    await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    }),
  );
}

export async function refreshArticle(id: string) {
  return readJson<{
    article: Article;
    knowledgePoints: KnowledgePoint[];
    extractError?: string;
  }>(await fetch(`/api/articles/${id}/refresh`, { method: "POST" }));
}

export async function deleteArticle(id: string) {
  await readJson<{ ok: boolean }>(await fetch(`/api/articles/${id}`, { method: "DELETE" }));
}

export async function fetchSettings() {
  return readJson<{ settings: Settings; hasKey: boolean }>(
    await fetch("/api/settings", { cache: "no-store" }),
  );
}

export async function saveSettings(input: Partial<Settings> & { test?: boolean }) {
  return readJson<{ settings: Settings; hasKey: boolean; test?: string }>(
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchKnowledge() {
  return readJson<{ items: KnowledgeTraceItem[] }>(await fetch("/api/knowledge"));
}

export async function classifySelectionAsk(input: {
  articleId: string;
  quote: string;
  question: string;
}) {
  return readJson<{
    knowledgePointId: string;
    name: string;
    reason: string;
    created?: boolean;
    point?: KnowledgePoint;
  }>(
    await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function streamChat(input: {
  articleId: string;
  knowledgePointId: string;
  message: string;
  quote?: string;
  onToken: (token: string) => void;
}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleId: input.articleId,
        knowledgePointId: input.knowledgePointId,
        message: input.message,
        quote: input.quote,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => ({ error: "提问失败" }))) as { error?: string };
      throw new Error(payload.error || "提问失败");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistant = "";
    let mentionedKnowledgeIds: string[] = [];

    const consume = (block: string) => {
      const event = block.match(/^event: (.+)$/m)?.[1]?.trim();
      const dataLine = block.match(/^data: ([\s\S]+)$/m)?.[1];
      if (!event || !dataLine) return;
      const data = JSON.parse(dataLine) as {
        token?: string;
        error?: string;
        assistant?: { content: string; mentionedKnowledgeIds?: string[] };
        mentionedKnowledgeIds?: string[];
      };
      if (event === "token" && data.token) {
        assistant += data.token;
        input.onToken(data.token);
      }
      if (event === "error" && data.error) throw new Error(data.error);
      if (event === "done") {
        assistant = data.assistant?.content || assistant;
        mentionedKnowledgeIds = data.mentionedKnowledgeIds || data.assistant?.mentionedKnowledgeIds || [];
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) consume(part);
    }
    if (buffer.trim()) consume(buffer);
    return { content: assistant, mentionedKnowledgeIds };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("模型响应超时，请再试一次");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
