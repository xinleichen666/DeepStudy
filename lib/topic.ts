import type { TopicOverview } from "./types";

export type LlmTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LibraryBrief = {
  id: string;
  title: string;
  summary: string;
  updatedAt?: string;
  textSample?: string;
  points?: Array<{ name: string; definition: string }>;
};

export type LibraryHit = LibraryBrief & { score: number };

export type LibraryContext = {
  matched: LibraryHit[];
  catalog: Array<{ id: string; title: string }>;
};

const WEAK_BIGRAMS = new Set([
  "设计",
  "方法",
  "研究",
  "分析",
  "基于",
  "系统",
  "模型",
  "问题",
  "应用",
  "技术",
  "实验",
  "结果",
  "一种",
  "以及",
  "通过",
  "进行",
  "可以",
  "我们",
  "本文",
  "相关",
  "主要",
  "实现",
  "提出",
  "采用",
  "不同",
  "影响",
  "条件",
  "过程",
  "参数",
  "性能",
  "结构",
]);

export function normalizeTopicTitle(input: string) {
  const title = input.replace(/\s+/g, " ").trim();
  if (title.length < 2) return "";
  return title.slice(0, 80);
}

export function selectLibraryContext(
  title: string,
  articles: LibraryBrief[],
  options?: { preferIds?: string[]; limit?: number },
): LibraryContext {
  const limit = options?.limit ?? 4;
  const prefer = new Set(options?.preferIds ?? []);
  const grams = topicGrams(title);
  const latin = latinTokens(title);
  const ranked = articles
    .map((article) => ({
      ...article,
      points: article.points ?? [],
      score: scoreArticle(grams, latin, article) + (prefer.has(article.id) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const matched = ranked.filter((item) => item.score >= 7).slice(0, limit);
  const matchedIds = new Set(matched.map((item) => item.id));
  const catalog = [...articles]
    .filter((item) => !matchedIds.has(item.id))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 8)
    .map((item) => ({ id: item.id, title: item.title }));

  return { matched, catalog };
}

export function formatLibraryContext(library: LibraryContext) {
  const parts: string[] = [];
  if (library.matched.length) {
    parts.push("文库中与课题较相关的文献（只能引用这里出现过的题名，不要补充年份、作者或 DOI）：");
    library.matched.forEach((article, index) => {
      const points = (article.points ?? [])
        .slice(0, 6)
        .map((point) => `${point.name}：${clip(point.definition, 80)}`)
        .join("；");
      const lines = [
        `${index + 1}. 题名：${article.title}`,
        article.summary ? `摘要：${clip(article.summary, 280)}` : "",
        points ? `已抽取知识点：${points}` : "",
        article.textSample ? `正文摘录：${clip(article.textSample, 700)}` : "",
      ].filter(Boolean);
      parts.push(lines.join("\n"));
    });
  } else {
    parts.push("文库中没有明显对得上的文献。不要假设学生已经读过某篇具体论文。");
  }
  if (library.catalog.length) {
    parts.push(
      `文库中的其他题名（无关则不要引用）：\n${library.catalog.map((item) => `- ${item.title}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export function buildOverviewPrompt(title: string, library: LibraryContext): LlmTurn[] {
  return [
    {
      role: "system",
      content:
        "你是带中国研究生自学的导师「研迹」，学生的方向多在集成量子光子学与薄膜铌酸锂器件。只输出一个 JSON 对象，不要 Markdown 围栏，不要前后解释。",
    },
    {
      role: "user",
      content: `请为下面的课题写一份可继续追问的知识概览。

硬性要求：
1. 全部使用中文。物理量、器件关系和公式用 LaTeX，行内公式写 $...$。
2. 面向已经学过电磁学与基础光学的研究生：具体、准确，写出假设和适用边界，避免空话和客套。
3. 不要编造论文题名、作者、年份、DOI 或期刊卷期。推荐阅读写检索方向、经典问题和关键词；只有下文「文库」里出现过的题名才可以原样引用。
4. 若文库文献与课题相关，在 background 或 stateOfArt 里说明它覆盖了哪一块。
5. 开放问题要具体到可以做成研究问题，不要写「还需要更多研究」。
6. concepts 写 4 到 7 条，methods 写 3 到 6 条，openProblems 写 3 到 6 条，keywords 写 6 到 12 个，reading 写 3 到 6 条。

输出 JSON：
{
  "background": "180到320字，说明这个问题从哪来、要解决什么",
  "concepts": [{"name": "短名称", "principle": "原理，必要时含公式"}],
  "methods": [{"name": "方法名", "summary": "做法、输入输出和局限"}],
  "stateOfArt": "160到280字的现状，区分已做成的和仍不稳的",
  "openProblems": ["具体开放问题"],
  "reading": [{"title": "检索方向或文库中的原题名", "why": "为什么先读这个", "keywords": ["检索词"]}],
  "keywords": ["课题关键词"]
}

课题：${title}

${formatLibraryContext(library)}`,
    },
  ];
}

export function summarizeOverview(overview: TopicOverview) {
  return clip(
    [
      `背景：${overview.background}`,
      `概念：${overview.concepts.map((item) => `${item.name}（${item.principle}）`).join("；")}`,
      `方法：${overview.methods.map((item) => `${item.name}（${item.summary}）`).join("；")}`,
      `现状：${overview.stateOfArt}`,
      `开放问题：${overview.openProblems.join("；")}`,
      `关键词：${overview.keywords.join("、")}`,
    ].join("\n"),
    4000,
  );
}

export function buildTopicChatMessages(input: {
  title: string;
  overview: TopicOverview | null;
  library: LibraryContext;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): LlmTurn[] {
  const overviewText = input.overview
    ? summarizeOverview(input.overview)
    : "（还没有生成概览。先按课题名称和文库上下文回答。）";
  return [
    {
      role: "system",
      content: `你是导师「研迹」，正在带学生吃透课题「${input.title}」。追问时顺着已有概览往下讲：必要时写出公式，点明假设和适用边界，并说明这和课题目标的关系。

规则：
- 中文。公式用 $...$ 或 $$...$$，不要放进代码块。
- 先给结论再展开。没有公式时大约 400 字；有公式时把符号说明写完。
- 不要编造文献题名、年份或 DOI。可以引用下方文库里给出的题名。
- 学生问到概览之外的内容时直接讲，并标明这是延伸。
- 禁止客套，禁止「希望对你有帮助」。

版式用 Markdown：
- 先写 \`## 结论\`
- 需要公式时写 \`## 公式\`
- 需要分点时写 \`## 要点\`，最多 5 条
- 最后若与课题目标有关，写 \`## 和课题的关系\``,
    },
    {
      role: "user",
      content: `课题：${input.title}

概览：
${overviewText}

${formatLibraryContext(input.library)}`,
    },
    {
      role: "assistant",
      content: "概览已经对齐。可以沿着背景、概念、方法、现状和开放问题追问。",
    },
    ...input.history.slice(-16).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: input.userMessage },
  ];
}

export function parseTopicOverview(raw: string, usedArticleIds: string[], generatedAt: string): TopicOverview {
  const json = extractJsonObject(raw);
  const background = clip(textField(json, ["background"]), 1200);
  const concepts = asRecords(json.concepts)
    .map((item) => ({
      name: clip(textField(item, ["name", "title"]), 40),
      principle: clip(textField(item, ["principle", "explanation", "definition", "summary"]), 500),
    }))
    .filter((item) => item.name && item.principle)
    .slice(0, 8);
  const methods = asRecords(json.methods)
    .map((item) => ({
      name: clip(textField(item, ["name", "title"]), 40),
      summary: clip(textField(item, ["summary", "description", "principle"]), 500),
    }))
    .filter((item) => item.name && item.summary)
    .slice(0, 8);
  const stateOfArt = clip(textField(json, ["stateOfArt", "state_of_the_art", "status"]), 1600);
  const openProblems = uniqueStrings(
    asStrings(json.openProblems ?? json.open_problems ?? json.questions).map((item) => clip(item, 200)),
  ).slice(0, 8);
  const reading = asRecords(json.reading)
    .map((item) => ({
      title: clip(textField(item, ["title", "name"]), 120),
      why: clip(textField(item, ["why", "reason", "summary"]), 300),
      keywords: uniqueStrings(asStrings(item.keywords).map((word) => clip(word, 40))).slice(0, 8),
    }))
    .filter((item) => item.title)
    .slice(0, 8);
  const keywords = uniqueStrings(asStrings(json.keywords).map((item) => clip(item, 40))).slice(0, 16);
  if (background.length < 20 || concepts.length < 2) {
    throw new Error("模型未返回完整的课题概览，请重试");
  }
  return {
    background,
    concepts,
    methods,
    stateOfArt,
    openProblems,
    reading,
    keywords,
    usedArticleIds: [...new Set(usedArticleIds.map((id) => id.trim()).filter(Boolean))].slice(0, 8),
    generatedAt,
  };
}

function topicGrams(title: string) {
  const weights = new Map<string, number>();
  for (const piece of cjkPieces(title)) {
    if (piece.length <= 12) bump(weights, piece, 5);
    const maxN = Math.min(4, piece.length);
    for (let size = 2; size <= maxN; size += 1) {
      const weight = size === 2 ? 0.35 : size === 3 ? 1.4 : 2.2;
      for (let index = 0; index + size <= piece.length; index += 1) {
        const gram = piece.slice(index, index + size);
        if (size === 2 && WEAK_BIGRAMS.has(gram)) continue;
        bump(weights, gram, weight);
      }
    }
  }
  return weights;
}

function cjkPieces(text: string) {
  const chunks = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  const pieces: string[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.split(/(?:基于|面向|关于|以及|及其|用于|中的|的|与|及|和)/)) {
      if (part.length >= 2) pieces.push(part);
    }
  }
  return pieces;
}

function latinTokens(text: string) {
  return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9+/-]{2,}/g) ?? []).filter((word) => word.length >= 4))];
}

function scoreArticle(grams: Map<string, number>, latin: string[], article: LibraryBrief) {
  const title = compact(article.title);
  const summary = compact(article.summary);
  const points = compact((article.points ?? []).map((point) => `${point.name}${point.definition}`).join(""));
  const body = compact(article.textSample || "");
  let score = 0;
  for (const [gram, weight] of grams) {
    if (title.includes(gram)) score += weight * 3;
    else if (summary.includes(gram)) score += weight * 1.6;
    else if (points.includes(gram)) score += weight * 1.2;
    else if (gram.length >= 3 && body.includes(gram)) score += weight * 1.2;
  }
  const latinHay = `${article.title}\n${article.summary}\n${article.textSample || ""}`.toLowerCase();
  const pointHay = (article.points ?? []).map((point) => `${point.name} ${point.definition}`).join("\n").toLowerCase();
  for (const word of latin) {
    if (title.toLowerCase().includes(word)) score += 8;
    else if (latinHay.includes(word) || pointHay.includes(word)) score += 4;
  }
  return score;
}

function bump(weights: Map<string, number>, gram: string, weight: number) {
  weights.set(gram, Math.max(weights.get(gram) || 0, weight));
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回可解析的课题概览，请重试");
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("模型未返回可解析的课题概览，请重试");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("模型未返回")) throw error;
    throw new Error("模型未返回可解析的课题概览，请重试");
  }
}

function asRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function asStrings(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[、,，;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function textField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function clip(text: string, max: number) {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}
