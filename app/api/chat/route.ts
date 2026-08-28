import { jsonError, jsonOk, readBody } from "@/lib/http";
import { buildChatMessages, collectMentions, streamComplete } from "@/lib/llm";
import {
  addMentions,
  appendMessage,
  getArticleDetail,
  getDb,
  getOrCreateConversation,
  getSettings,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await readBody<{
      articleId?: string;
      knowledgePointId?: string;
      message?: string;
      quote?: string;
      stream?: boolean;
    }>(request);

    if (!body.articleId || !body.knowledgePointId || !body.message?.trim()) {
      return jsonError(new Error("缺少提问内容"));
    }

    const articleId = body.articleId;
    const knowledgePointId = body.knowledgePointId;
    const quote = body.quote?.replace(/\s+/g, " ").trim() || "";
    const userText = quote
      ? `> ${quote.slice(0, 600)}\n\n${body.message.trim()}`
      : body.message.trim();

    const detail = await getArticleDetail(articleId);
    if (!detail) return jsonError(new Error("文章不存在"));
    const point = detail.knowledgePoints.find((item) => item.id === knowledgePointId);
    if (!point) return jsonError(new Error("知识点不存在"));

    const conversation = await getOrCreateConversation(articleId, knowledgePointId);
    const history = detail.messages.filter((item) => item.conversationId === conversation.id);

    const userMessage = await appendMessage({
      conversationId: conversation.id,
      articleId,
      knowledgePointId,
      role: "user",
      content: userText,
      mentionedKnowledgeIds: [],
    });

    const settings = await getSettings();
    const llmMessages = buildChatMessages({
      article: detail.article,
      point,
      history,
      userMessage: userText,
      quote,
    });

    if (body.stream === false) {
      let answer = "";
      for await (const token of streamComplete(settings, llmMessages)) {
        answer += token;
      }
      const db = await getDb();
      const mentioned = collectMentions(answer, db.knowledgePoints, point.id);
      const assistant = await appendMessage({
        conversationId: conversation.id,
        articleId,
        knowledgePointId,
        role: "assistant",
        content: answer,
        mentionedKnowledgeIds: mentioned,
      });
      await persistMentions({
        articleId,
        conversationId: conversation.id,
        messageId: assistant.id,
        currentId: point.id,
        relatedIds: mentioned,
        content: answer,
      });
      return jsonOk({ conversation, userMessage, assistant });
    }

    const encoder = new TextEncoder();
    let answer = "";
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          send("meta", { conversationId: conversation.id, userMessage });
          for await (const token of streamComplete(settings, llmMessages)) {
            answer += token;
            send("token", { token });
          }
          const db = await getDb();
          const mentioned = collectMentions(answer, db.knowledgePoints, point.id);
          const assistant = await appendMessage({
            conversationId: conversation.id,
            articleId,
            knowledgePointId,
            role: "assistant",
            content: answer,
            mentionedKnowledgeIds: mentioned,
          });
          await persistMentions({
            articleId,
            conversationId: conversation.id,
            messageId: assistant.id,
            currentId: point.id,
            relatedIds: mentioned,
            content: answer,
          });
          send("done", { assistant, mentionedKnowledgeIds: mentioned });
        } catch (error) {
          send("error", { error: error instanceof Error ? error.message : "模型调用失败" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function persistMentions(input: {
  articleId: string;
  conversationId: string;
  messageId: string;
  currentId: string;
  relatedIds: string[];
  content: string;
}) {
  await addMentions([
    {
      knowledgePointId: input.currentId,
      articleId: input.articleId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      excerpt: input.content.slice(0, 160),
    },
    ...input.relatedIds.map((relatedId) => ({
      knowledgePointId: input.currentId,
      relatedKnowledgePointId: relatedId,
      articleId: input.articleId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      excerpt: input.content.slice(0, 160),
    })),
    ...input.relatedIds.map((relatedId) => ({
      knowledgePointId: relatedId,
      relatedKnowledgePointId: input.currentId,
      articleId: input.articleId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      excerpt: input.content.slice(0, 160),
    })),
  ]);
}
