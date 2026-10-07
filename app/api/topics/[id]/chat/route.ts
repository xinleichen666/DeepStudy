import { applyEnvApiKey } from "@/lib/api-key";
import { jsonError, readBody } from "@/lib/http";
import { streamComplete } from "@/lib/llm";
import { resolveSettings } from "@/lib/providers";
import { buildTopicChatMessages, selectLibraryContext } from "@/lib/topic";
import {
  appendTopicMessage,
  getSettings,
  getTopicDetail,
  listLibraryBriefs,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await readBody<{ message?: string }>(request);
    const text = body.message?.replace(/\s+\n/g, "\n").trim() || "";
    if (!text) return jsonError(new Error("请先写下问题"));
    if (text.length > 4000) return jsonError(new Error("问题请控制在 4000 字以内"));

    const detail = await getTopicDetail(id);
    if (!detail) return jsonError(new Error("课题不存在"));
    if (!detail.topic.overview) return jsonError(new Error("请先生成课题概览，再追问"));

    const settings = applyEnvApiKey(resolveSettings(await getSettings()));
    if (!settings.apiKey.trim()) {
      return jsonError(new Error("请先在设置中填写 API Key，或设置环境变量 DEEPSEEK_API_KEY / DEEPSTUDY_API_KEY"));
    }

    const prior = detail.messages.slice(-16);
    const library = selectLibraryContext(detail.topic.title, await listLibraryBriefs(), {
      preferIds: detail.topic.overview.usedArticleIds,
    });
    const userMessage = await appendTopicMessage({
      topicId: id,
      role: "user",
      content: text,
    });
    const turns = buildTopicChatMessages({
      title: detail.topic.title,
      overview: detail.topic.overview,
      library,
      history: prior,
      userMessage: text,
    });

    const encoder = new TextEncoder();
    let answer = "";
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          send("meta", { userMessage });
          for await (const token of streamComplete(settings, turns, 0.3)) {
            answer += token;
            send("token", { token });
          }
          if (!answer.trim()) throw new Error("模型没有返回内容");
          const assistant = await appendTopicMessage({
            topicId: id,
            role: "assistant",
            content: answer.trim(),
          });
          send("done", { userMessage, assistant });
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
