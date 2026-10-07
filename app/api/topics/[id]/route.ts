import { jsonError, jsonOk } from "@/lib/http";
import { deleteTopic, getTopicDetail } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const detail = await getTopicDetail(id);
    if (!detail) return jsonError(new Error("课题不存在"));
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await deleteTopic(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
