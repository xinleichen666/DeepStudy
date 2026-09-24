"use client";

import { useRef } from "react";
import type { KnowledgePoint } from "@/lib/types";
import { HighlightMarks } from "@/components/HighlightMarks";
import { PdfOriginalView } from "@/components/PdfOriginalView";

export function ArticleView({
  sourceType,
  fileUrl,
  title,
  html,
  pageTexts,
  points,
  activeId,
  pageZoom = 100,
  onSelect,
}: {
  sourceType: "url" | "pdf";
  fileUrl?: string;
  title: string;
  html?: string;
  pageTexts: string[];
  points: KnowledgePoint[];
  activeId?: string;
  pageZoom?: number;
  onSelect: (id: string) => void;
}) {
  if (sourceType === "pdf" && fileUrl) {
    return (
      <PdfOriginalView
        fileUrl={fileUrl}
        points={points}
        activeId={activeId}
        pageZoom={pageZoom}
        onSelect={onSelect}
      />
    );
  }

  return (
    <HtmlOriginalView
      title={title}
      html={html}
      pageTexts={pageTexts}
      points={points}
      activeId={activeId}
      pageZoom={pageZoom}
      onSelect={onSelect}
    />
  );
}

function HtmlOriginalView({
  title,
  html,
  pageTexts,
  points,
  activeId,
  pageZoom,
  onSelect,
}: {
  title: string;
  html?: string;
  pageTexts: string[];
  points: KnowledgePoint[];
  activeId?: string;
  pageZoom: number;
  onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasHeading = Boolean(html && /<h1[\s>]/i.test(html));

  return (
    <div className="doc-stage">
      <div className="doc-page" ref={rootRef} style={{ zoom: pageZoom / 100 }}>
        {!hasHeading ? (
          <header className="doc-masthead">
            <h1>{title}</h1>
          </header>
        ) : null}
        {html ? (
          <div className="article-html" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          pageTexts.map((page, index) => (
            <section key={index} className="doc-plain" data-page={index + 1}>
              {pageTexts.length > 1 ? <p className="doc-page-label">第 {index + 1} 页</p> : null}
              <pre>{page}</pre>
            </section>
          ))
        )}
        <HighlightMarks
          rootRef={rootRef}
          points={points}
          activeId={activeId}
          onSelect={onSelect}
          deps={[html, pageTexts, pageZoom]}
        />
      </div>
    </div>
  );
}
