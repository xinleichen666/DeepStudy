"use client";

import { ingestPdfAction, ingestUrlAction } from "@/app/study-actions";
import { ImportProgressGate, ImportSubmit } from "@/components/ImportProgress";
import { cn } from "@/lib/utils";

export function ImportPanel({
  compact = false,
  back = "/",
  error = "",
}: {
  compact?: boolean;
  back?: string;
  error?: string;
}) {
  return (
    <section className={cn("import-card", compact && "compact")}>
      {error ? <p className="form-error">{error}</p> : null}

      <p className="import-label">文章链接</p>
      <form action={ingestUrlAction} className="import-row">
        <ImportProgressGate kind="url" />
        <input type="hidden" name="back" value={back} />
        <input name="url" placeholder="粘贴论文、博客或 arXiv 链接" />
        <ImportSubmit>导入并提问</ImportSubmit>
      </form>

      <p className="import-label">PDF 文件</p>
      <form action={ingestPdfAction} className="import-row pdf-row">
        <ImportProgressGate kind="pdf" />
        <input type="hidden" name="back" value={back} />
        <input name="file" type="file" accept="application/pdf,.pdf" />
        <ImportSubmit>导入 PDF</ImportSubmit>
      </form>
    </section>
  );
}
