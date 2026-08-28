import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

export function MessageBody({
  text,
  names,
  compact = false,
}: {
  text: string;
  names?: Record<string, string>;
  compact?: boolean;
}) {
  const blocks = splitBlocks(text);
  return (
    <div className={cn("md", compact && "md-compact")}>
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre key={index} className="md-code">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "math") {
          return <MathBlock key={index} tex={block.text} />;
        }
        if (block.type === "heading") {
          return (
            <h4 key={index} className="md-h">
              {inline(block.text, names)}
            </h4>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="md-ul">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item, names)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} className="md-quote">
              {inline(block.text, names)}
            </blockquote>
          );
        }
        return (
          <p key={index} className="md-p">
            {inline(block.text, names)}
          </p>
        );
      })}
    </div>
  );
}

function MathBlock({ tex }: { tex: string }) {
  const html = renderTex(tex, true);
  if (!html) return <pre className="md-code">{tex}</pre>;
  return <div className="md-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "math"; text: string };

const DISPLAY_MATH =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(\\begin\{(?:align\*?|equation\*?|gather\*?|aligned)\}[\s\S]*?\\end\{(?:align\*?|equation\*?|gather\*?|aligned)\})/g;

function splitBlocks(raw: string): Block[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const chunks: Block[] = [];
  const fence = /```[\w-]*\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const parts: Array<{ kind: "md" | "code"; value: string }> = [];
  while ((match = fence.exec(text))) {
    if (match.index > last) parts.push({ kind: "md", value: text.slice(last, match.index) });
    parts.push({ kind: "code", value: match[1].replace(/\n$/, "") });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "md", value: text.slice(last) });
  if (!parts.length) parts.push({ kind: "md", value: text });

  for (const part of parts) {
    if (part.kind === "code") {
      chunks.push({ type: "code", text: part.value });
      continue;
    }
    parseMarkdown(part.value, chunks);
  }
  return chunks;
}

function parseMarkdown(value: string, chunks: Block[]) {
  const pieces: Array<{ kind: "md" | "math"; value: string }> = [];
  let last = 0;
  DISPLAY_MATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DISPLAY_MATH.exec(value))) {
    if (match.index > last) pieces.push({ kind: "md", value: value.slice(last, match.index) });
    pieces.push({ kind: "math", value: match[1] ?? match[2] ?? match[3] ?? "" });
    last = match.index + match[0].length;
  }
  if (last < value.length) pieces.push({ kind: "md", value: value.slice(last) });
  if (!pieces.length) pieces.push({ kind: "md", value });

  for (const piece of pieces) {
    if (piece.kind === "math") {
      const tex = piece.value.trim();
      if (tex) chunks.push({ type: "math", text: tex });
      continue;
    }
    parseLines(piece.value, chunks);
  }
}

function parseLines(value: string, chunks: Block[]) {
  const lines = value.split("\n");
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    chunks.push({ type: "list", items: list });
    list = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
        const labeled = trimmed.match(/^(一句话|要点|原文|易混|例子|定义|公式|归属)[：:]\s*(.*)$/);
    if (labeled) {
      flushList();
      chunks.push({ type: "heading", text: labeled[1] });
      if (labeled[2]) chunks.push({ type: "paragraph", text: labeled[2] });
      continue;
    }
    const heading =
      trimmed.match(/^#{1,4}\s+(.+)$/) ||
      trimmed.match(/^\*\*([^*]{1,20})\*\*$/) ||
      trimmed.match(/^【(.{1,16})】\s*$/);
    if (heading && !trimmed.startsWith("- ") && !/^\d+[.)]/.test(trimmed)) {
      flushList();
      chunks.push({ type: "heading", text: heading[1] });
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^([-*•]|\d+[.)])\s+/, ""));
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushList();
      chunks.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }
    flushList();
    const prev = chunks[chunks.length - 1];
    if (prev?.type === "paragraph") prev.text += "\n" + trimmed;
    else chunks.push({ type: "paragraph", text: trimmed });
  }
  flushList();
}

const INLINE_SPLIT =
  /(\\\(.+?\\\)|\$(?!\$)[^$\n]+?\$(?!\$)|\*\*[^*]+\*\*|`[^`]+`|【[^】]{1,40}】)/g;

function inline(text: string, names?: Record<string, string>) {
  const pieces = text.split(INLINE_SPLIT).filter(Boolean);
  return pieces.map((piece, index) => {
    const display = piece.match(/^\$\$([\s\S]+)\$\$$/) || piece.match(/^\\\[([\s\S]+)\\\]$/);
    if (display?.[1]) {
      return <MathBlock key={index} tex={display[1]} />;
    }
    const math =
      piece.match(/^\\\((.+?)\\\)$/) ||
      piece.match(/^\$(.+)\$$/);
    if (math?.[1]) {
      const html = renderTex(math[1], false);
      if (!html) {
        return (
          <code key={index} className="md-inline">
            {math[1]}
          </code>
        );
      }
      return <span key={index} className="md-math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return (
        <code key={index} className="md-inline">
          {piece.slice(1, -1)}
        </code>
      );
    }
    const mention = piece.match(/^【([^】]+)】$/);
    if (mention) {
      const known = names ? Object.values(names).includes(mention[1]) : false;
      return (
        <mark key={index} className={cn("mention", known && "known")}>
          {mention[1]}
        </mark>
      );
    }
    return <span key={index}>{piece}</span>;
  });
}

function renderTex(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return "";
  }
}
