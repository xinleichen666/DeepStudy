import { jsonError, jsonOk } from "@/lib/http";
import { regenerateTopicOverview } from "@/lib/topic-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const topic = await regenerateTopicOverview(id);
    return jsonOk({ topic });
  } catch (error) {
    return jsonError(error);
  }
}
