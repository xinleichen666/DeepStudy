import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getArticleDetail, getUploadPath } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Ctx) {
  const { id } = await context.params;
  const detail = await getArticleDetail(id);
  if (!detail || detail.article.sourceType !== "pdf") {
    return NextResponse.json({ error: "PDF 不存在" }, { status: 404 });
  }
  const filePath = getUploadPath(id, detail.article.fileName);
  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(detail.article.fileName || "article.pdf")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF 文件缺失" }, { status: 404 });
  }
}
