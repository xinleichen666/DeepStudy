import { resolveSettings } from "./providers";
import type {
  Article,
  ChatMessage,
  KnowledgePoint,
  Settings,
} from "./types";

type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function assertReady(settings: Settings) {
  const resolved = resolveSettings(settings);
  if (!resolved.apiKey.trim()) {
    throw new LlmError("请先在设置中填写国产模型 API Key");
  }
  if (!resolved.baseUrl.trim()) {
    throw new LlmError("请填写模型接口地址");
  }
  if (!resolved.model.trim()) {
    throw new LlmError("请填写模型名称");
  }
  return resolved;
}

async function complete(settings: Settings, messages: ChatTurn[], temperature = 0.3) {
  const resolved = assertReady(settings);
  const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolved.model,
      temperature,
      messages,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new LlmError(parseError(raw, response.status), response.status);
  }
  const data = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new LlmError("模型没有返回内容");
  return content;
}

export async function* streamComplete(
  settings: Settings,
  messages: ChatTurn[],
  temperature = 0.25,
) {
  const resolved = assertReady(settings);
  const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolved.model,
      temperature,
      stream: true,
      messages,
    }),
  });

  if (!response.ok || !response.body) {
    const raw = await response.text();
    throw new LlmError(parseError(raw, response.status), response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() ?? "";
    for (const line of chunks) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = json.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {
        // ignore keep-alive or malformed SSE lines
      }
    }
  }
}

function parseError(raw: string, status: number) {
  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string") return json.error;
    return json.error?.message || json.message || `模型接口错误（${status}）`;
  } catch {
    return raw.slice(0, 240) || `模型接口错误（${status}）`;
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new LlmError("模型未返回可解析的 JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

export type ExtractedPoint = {
  name: string;
  category: string;
  definition: string;
  excerpt: string;
  question: string;
  difficulty: KnowledgePoint["difficulty"];
  page?: number;
};

export async function extractKnowledge(settings: Settings, article: Article) {
  const body = buildArticlePayload(article);
  const content = await complete(
    settings,
    [
      {
        role: "system",
        content:
          "你是带中国研究生精读文献的导师。只输出 JSON，不要输出解释性前后文。",
      },
      {
        role: "user",
        content: `请阅读文献并抽取理解全文所必需的基础知识点，随后为每个知识点设计一个启发式提问，供学生自学。

硬性要求：
1. 抽取 8 到 16 个知识点，必须来自文章的科学/技术正文：术语、核心方法、关键假设、实验安排、重要结论。
2. 忽略页眉页脚、出版社名称、公众号关注引导、「阅读原文」、版权声明、广告和平台介绍。不要把 AIP Publishing、微信公众平台、检索入口这类元信息当成知识点。
3. excerpt 必须是原文中连续出现的原句或短语，禁止改写、禁止翻译，以便在原文中定位高亮。
4. 若原文带有「第 N 页」标记，请填写 page 数字。
5. question 要能检验是否真正理解：优先问机制、假设、公式含义或与相邻概念的差别，避免只问“什么是某某”。
6. 全部使用中文（excerpt 保持原文语言；公式用 LaTeX）。
7. 涉及物理量、变换、算符或定量关系时，definition 里用 LaTeX 写出关键公式，例如 $k=2\\pi/\\lambda$。

输出 JSON：
{
  "title": "文献标题",
  "summary": "不超过 180 字的中文摘要",
  "knowledgePoints": [
    {
      "name": "短名称",
      "category": "概念|方法|定理|实验|术语|结论",
      "definition": "导师口吻的解释；有定量关系时写出关键公式",
      "excerpt": "原文片段",
      "page": 1,
      "question": "针对该知识点的提问",
      "difficulty": "basic"
    }
  ]
}

文献：
${body}`,
      },
    ],
    0.2,
  );

  const json = extractJson(content);
  const points = Array.isArray(json.knowledgePoints) ? json.knowledgePoints : [];
  const knowledgePoints: ExtractedPoint[] = points
    .map((item) => normalizePoint(item, article))
    .filter((item): item is ExtractedPoint => Boolean(item));

  if (knowledgePoints.length === 0) {
    throw new LlmError("未能从文献中抽出知识点，请换一篇文章或更换模型后重试");
  }

  return {
    title: String(json.title || article.title || "未命名文献").slice(0, 180),
    summary: String(json.summary || "").slice(0, 400),
    knowledgePoints,
  };
}

export type ClassifyDecision =
  | { match: "existing"; knowledgePointId: string; name: string; reason: string }
  | { match: "new"; name: string; reason: string; created: ExtractedPoint };

export async function classifySelection(
  settings: Settings,
  article: Article,
  points: KnowledgePoint[],
  quote: string,
  question: string,
): Promise<ClassifyDecision> {
  const local = matchPointLocally(points, quote, question);
  try {
    const list = points.length
      ? points
          .map(
            (point, index) =>
              `${index + 1}. id=${point.id}\n名称：${point.name}\n类别：${point.category}\n定义：${point.definition.slice(0, 120)}\n原文：${point.excerpt.slice(0, 80)}`,
          )
          .join("\n\n")
      : "（当前还没有已抽取的知识点）";
    const content = await complete(
      settings,
      [
        {
          role: "system",
          content:
            "你判断学生的划词提问是否属于该文献已经总结的知识点。只输出 JSON，不要解释。对不上就新建，禁止硬归到最接近的一条。",
        },
        {
          role: "user",
          content: `划选原文：
${quote.slice(0, 500)}

学生提问：
${question.slice(0, 300)}

已总结的知识点：
${list}

规则：
1. 只有提问明确就是在问某一条（同一概念、方法、定理、实验或结论）才归类。
2. 划选碰巧落在某条 excerpt 附近、但问题在问另一个概念，不算匹配。
3. 现有列表里没有对应条目，或只有勉强沾边的关系，必须新建。

对得上：{"match":"existing","id":"必须是上列 id 之一","reason":"不超过 36 字"}
对不上：{"match":"new","name":"短名称","category":"概念|方法|定理|实验|术语|结论","definition":"一两句解释；有公式用 LaTeX","reason":"不超过 36 字，说明为何不是已有条目"}`,
        },
      ],
      0.1,
    );
    const json = extractJson(content);
    const match = String(json.match || "").trim().toLowerCase();
    const id = String(json.id || json.knowledgePointId || "").trim();
    const found = points.find((item) => item.id === id);
    if (match !== "new" && found) {
      return {
        match: "existing",
        knowledgePointId: found.id,
        name: found.name,
        reason: String(json.reason || "").slice(0, 80),
      };
    }
    if (match === "new" || match === "none" || !found) {
      return {
        match: "new",
        name: String(json.name || "").slice(0, 40) || draftName(quote, question),
        reason: String(json.reason || "提问不在已总结的知识点中").slice(0, 80),
        created: buildCreatedPoint(json, article, quote, question),
      };
    }
  } catch {
    // 模型失败时：只有原文/名称明显重合才归类，否则新建
  }
  if (local) {
    return {
      match: "existing",
      knowledgePointId: local.id,
      name: local.name,
      reason: "提问与已总结知识点名称或原文片段明显重合",
    };
  }
  return {
    match: "new",
    name: draftName(quote, question),
    reason: "提问不在已总结的知识点中",
    created: draftPointFromAsk(article, quote, question),
  };
}

function buildCreatedPoint(
  json: Record<string, unknown>,
  article: Article,
  quote: string,
  question: string,
): ExtractedPoint {
  const drafted = draftPointFromAsk(article, quote, question);
  const name = String(json.name || "").trim().slice(0, 40) || drafted.name;
  const category = String(json.category || drafted.category).trim().slice(0, 20) || "概念";
  const definition = String(json.definition || drafted.definition).trim().slice(0, 800);
  return {
    ...drafted,
    name,
    category,
    definition,
  };
}

function draftPointFromAsk(article: Article, quote: string, question: string): ExtractedPoint {
  const excerpt = quote.replace(/\s+/g, " ").trim().slice(0, 280);
  return {
    name: draftName(quote, question),
    category: "概念",
    definition: question.trim().slice(0, 200),
    excerpt,
    question: question.trim().slice(0, 200),
    difficulty: "basic",
    page: guessPage(excerpt, article),
  };
}

function draftName(quote: string, question: string) {
  const fromQuote = quote.replace(/\s+/g, " ").trim();
  if (fromQuote.length >= 2 && fromQuote.length <= 24) return fromQuote;
  if (fromQuote.length > 24) return fromQuote.slice(0, 24);
  return question.replace(/\s+/g, " ").trim().slice(0, 24) || "新提问";
}

function matchPointLocally(points: KnowledgePoint[], quote: string, question: string) {
  if (!points.length) return null;
  const hay = compact(`${quote}${question}`);
  const quoteC = compact(quote);
  let best: KnowledgePoint | null = null;
  let bestScore = 0;
  for (const point of points) {
    let score = 0;
    const name = compact(point.name);
    const excerpt = compact(point.excerpt);
    if (name.length >= 2 && hay.includes(name)) score += 12;
    if (excerpt.length >= 8) {
      const needle = excerpt.slice(0, 16);
      if (needle && quoteC.includes(needle)) score += 16;
      if (quoteC.length >= 8 && excerpt.includes(quoteC.slice(0, 16))) score += 14;
    }
    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }
  return bestScore >= 12 ? best : null;
}

function normalizePoint(raw: unknown, article: Article): ExtractedPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const name = String(item.name || "").trim();
  const excerpt = String(item.excerpt || "").trim();
  const question = String(item.question || "").trim();
  if (!name || !excerpt || !question) return null;
  const difficulty =
    item.difficulty === "intermediate" || item.difficulty === "advanced"
      ? item.difficulty
      : "basic";
  const pageNum = Number(item.page);
  return {
    name: name.slice(0, 40),
    category: String(item.category || "概念").slice(0, 20),
    definition: String(item.definition || "").slice(0, 800),
    excerpt: excerpt.slice(0, 280),
    question: question.slice(0, 200),
    difficulty,
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : guessPage(excerpt, article),
  };
}

function guessPage(excerpt: string, article: Article) {
  if (!article.pageTexts.length) return undefined;
  const needle = compact(excerpt).slice(0, 24);
  if (!needle) return undefined;
  const index = article.pageTexts.findIndex((page) => compact(page).includes(needle));
  return index >= 0 ? index + 1 : undefined;
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function buildArticlePayload(article: Article) {
  if (article.pageTexts.length > 1) {
    const pages = article.pageTexts
      .map((text, index) => `--- 第 ${index + 1} 页 ---\n${text}`)
      .join("\n\n");
    return clip(pages, 24000);
  }
  return clip(article.text, 24000);
}

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 20;
  return `${text.slice(0, head)}\n\n……（中间省略）……\n\n${text.slice(-tail)}`;
}

export function buildChatMessages(input: {
  article: Article;
  point: KnowledgePoint;
  history: ChatMessage[];
  userMessage: string;
  quote?: string;
}): ChatTurn[] {
  const context = clip(input.article.text, 6000);
  const selectionRule = input.quote
    ? `
这次是划词提问，当前知识点是「${input.point.name}」。先对准这个概念讲解划选句；只有确实指向本文另一个已有知识点时，才用【知识点名】标出。
`
    : "";
  return [
    {
      role: "system",
      content: `你是带研究生的导师「研迹」，正在一对一精读这篇文献，当前只讨论「${input.point.name}」。像组会上带学生：对准概念、写出必要公式、点出假设与适用条件。不要像科普号，也不要像习题答案机。
${selectionRule}
版式（Markdown，便于小窗口阅读）：
- 先写 \`## 一句话\`，点破这个概念在本文中干什么。
- 只要涉及物理量、变换、算符、相位、滤波、成像关系或任何定量关系，必须写 \`## 公式\`：独立公式用 $$...$$，行内用 $...$，多行对齐可用 \\begin{align}...\\end{align}。公式后用一两句说明符号含义、以及它在本文里怎么用。不要把公式塞进代码块。
- 再写 \`## 要点\`，最多 4 条。把假设、近似和适用范围写进去。
- 需要引用时写 \`## 原文\`，只引一句。
- 示意图仍放在 \`\`\` 代码块里，一行一步。
- 学生明确要求时，才增加 \`## 易混\` 或 \`## 例子\`。

文风：
- 文字保持紧凑；公式和符号说明不受 200 字限制。没有公式时全文不超过约 220 字。
- 直接讲，禁止客套、禁止复述题目、禁止“希望对你有帮助”。
- 专有名词保持原文，不要用【】包裹；只有指向本文另一个知识点时才用【知识点名】。
- 不要堆“核心逻辑 / 关键特性 / 实现方式”这类空章节。`,
    },
    {
      role: "user",
      content: `文献：${input.article.title}
当前知识点：${input.point.name}（${input.point.category}）
已有解释：${input.point.definition}
原文定位：${input.point.excerpt}
${input.point.page ? `页码：${input.point.page}` : ""}

摘录：
${context}`,
    },
    {
      role: "assistant",
      content: `## 一句话\n先对齐概念。当前问题：${input.point.question}`,
    },
    ...input.history.map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    })),
    { role: "user", content: input.userMessage },
  ];
}

export function collectMentions(text: string, points: KnowledgePoint[], currentId: string) {
  const names = new Map<string, KnowledgePoint>();
  for (const point of points) {
    if (point.name.trim()) names.set(point.name.trim(), point);
  }

  const related = new Set<string>();
  const bracket = [...text.matchAll(/【([^】]{1,40})】/g)].map((match) => match[1]);
  for (const label of bracket) {
    const found = names.get(label) || [...names.values()].find((item) => label.includes(item.name));
    if (found && found.id !== currentId) related.add(found.id);
  }
  for (const point of points) {
    if (point.id === currentId) continue;
    if (point.name.length >= 2 && text.includes(point.name)) related.add(point.id);
  }
  return [...related];
}

export async function testConnection(settings: Settings) {
  const content = await complete(
    settings,
    [
      { role: "system", content: "只回复一个词：成功" },
      { role: "user", content: "请确认你已连通。" },
    ],
    0,
  );
  return content.slice(0, 40);
}
