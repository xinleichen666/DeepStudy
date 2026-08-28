import { jsonError, jsonOk } from "@/lib/http";
import { saveImportedPdf, saveImportedUrl } from "@/lib/article-ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(new Error("请上传 PDF 文件"));
      }
      const article = await saveImportedPdf(file);
      return jsonOk({ article });
    }

    const body = (await request.json()) as { url?: string };
    if (!body.url?.trim()) return jsonError(new Error("请提供文章链接"));
    const article = await saveImportedUrl(body.url.trim());
    return jsonOk({ article });
  } catch (error) {
    return jsonError(error);
  }
}
