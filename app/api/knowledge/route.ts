import { jsonError, jsonOk } from "@/lib/http";
import { getKnowledgeTrace } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getKnowledgeTrace();
    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}
