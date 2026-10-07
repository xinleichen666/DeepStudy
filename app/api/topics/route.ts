import { jsonError, jsonOk, readBody } from "@/lib/http";
import { normalizeTopicTitle } from "@/lib/topic";
import { regenerateTopicOverview } from "@/lib/topic-run";
import { createTopic, listTopics } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try {
    return jsonOk({ topics: await listTopics() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody<{ title?: string }>(request);
    const title = normalizeTopicTitle(body.title || "");
    if (!title) return jsonError(new Error("请先写下课题，至少两个字"));
    const topic = await createTopic(title);
    try {
      const saved = await regenerateTopicOverview(topic.id);
      return jsonOk({ topic: saved });
    } catch (error) {
      return jsonOk({
        topic,
        error: error instanceof Error ? error.message : "课题概览生成失败",
      });
    }
  } catch (error) {
    return jsonError(error);
  }
}
