import type { Article, Difficulty, KnowledgePoint } from "./types";

export type ArticleKind = "theory" | "experiment" | "mixed";

export type LibraryCard = Article & {
  knowledgeCount: number;
  discussedCount: number;
  messageCount: number;
  depth: Difficulty;
  depthLabel: string;
  depthScore: number;
  kind: ArticleKind;
  kindLabel: string;
};

export type LibraryLane = {
  kind: ArticleKind;
  kindLabel: string;
  articles: LibraryCard[];
};

export type LibraryGroup = {
  label: string;
  lanes: LibraryLane[];
  articles: LibraryCard[];
};

type CountedArticle = Article & {
  knowledgeCount: number;
  discussedCount: number;
  messageCount: number;
};

const DIRECTIONS: Array<{ label: string; keys: string[] }> = [
  {
    label: "光学实验与光场",
    keys: [
      "二阶关联",
      "符合测量",
      "符合计数",
      "time tagger",
      "时间标签",
      "hbt",
      "反聚束",
      "成像",
      "4f",
      "傅里叶",
      "景深",
      "交叉相位",
      "部分相干",
      "轨道角动量",
      "oam",
      "焦散",
      "超表面",
      "量子光学",
    ],
  },
  {
    label: "量子算法",
    keys: ["sat", "vqe", "qaoa", "qaa", "np完全", "np-complete", "量子缩放", "启发式", "rsra"],
  },
];

const THEORY_KEYS = [
  "理论",
  "算法",
  "定理",
  "证明",
  "解析",
  "推导",
  "模型",
  "数值模拟",
  "数值",
  "np",
  "sat",
  "vqe",
  "qaoa",
  "复杂度",
  "启发式",
  "缩放",
  "拟设",
];
const EXPERIMENT_KEYS = [
  "实验",
  "测量",
  "装置",
  "样品",
  "探测",
  "符合计数",
  "time tagger",
  "光刻",
  "超表面",
  "照明",
  "成像结果",
  "实验验证",
  "实验测量",
  "光学系统",
  "标定",
];

export function arrangeLibrary(articles: CountedArticle[], knowledgePoints: KnowledgePoint[]): LibraryGroup[] {
  const cards: LibraryCard[] = articles.map((article) => {
    const points = knowledgePoints.filter((item) => item.articleId === article.id);
    const depthScore = scoreDepth(points);
    const depth = depthFromScore(depthScore, points.length);
    const kind = classifyKind(article, points);
    return {
      ...article,
      depth,
      depthLabel: depth === "basic" ? "入门" : depth === "intermediate" ? "进阶" : "深入",
      depthScore,
      kind,
      kindLabel: kind === "theory" ? "理论" : kind === "experiment" ? "实验" : "理论+实验",
    };
  });

  const groups = clusterCards(cards, knowledgePoints).map((group) => {
    const sorted = [...group.articles].sort(compareShallowToDeep);
    return {
      label: group.label,
      articles: sorted,
      lanes: splitLanes(sorted),
    };
  });

  groups.sort((a, b) => {
    const shallowA = Math.min(...a.articles.map((item) => item.depthScore));
    const shallowB = Math.min(...b.articles.map((item) => item.depthScore));
    if (shallowA !== shallowB) return shallowA - shallowB;
    return (b.articles[0]?.updatedAt || "").localeCompare(a.articles[0]?.updatedAt || "");
  });

  return groups;
}

function splitLanes(articles: LibraryCard[]): LibraryLane[] {
  const order: ArticleKind[] = ["theory", "mixed", "experiment"];
  const labels: Record<ArticleKind, string> = {
    theory: "理论",
    mixed: "理论+实验",
    experiment: "实验",
  };
  return order
    .map((kind) => ({
      kind,
      kindLabel: labels[kind],
      articles: articles.filter((item) => item.kind === kind),
    }))
    .filter((lane) => lane.articles.length);
}

function classifyKind(article: Article, points: KnowledgePoint[]): ArticleKind {
  const blob = `${article.title}\n${article.summary || ""}\n${points.map((item) => `${item.category} ${item.name} ${item.definition}`).join("\n")}`.toLowerCase();
  let theory = 0;
  let experiment = 0;
  for (const point of points) {
    if (point.category === "定理" || point.category === "概念") theory += 1;
    if (point.category === "实验") experiment += 2;
    if (point.category === "方法" && /实验|测量|装置/.test(point.name)) experiment += 1;
    if (point.category === "方法" && /算法|定理|模型|证明/.test(point.name)) theory += 1;
  }
  for (const key of THEORY_KEYS) {
    if (blob.includes(key)) theory += 2;
  }
  for (const key of EXPERIMENT_KEYS) {
    if (blob.includes(key)) experiment += 2;
  }
  if (theory >= 4 && experiment >= 4) return "mixed";
  if (experiment > theory) return "experiment";
  if (theory > experiment) return "theory";
  return experiment >= theory ? "experiment" : "theory";
}

function scoreDepth(points: KnowledgePoint[]) {
  if (!points.length) return 0;
  const weight: Record<Difficulty, number> = { basic: 1, intermediate: 2, advanced: 3 };
  const sum = points.reduce((total, point) => total + (weight[point.difficulty] || 1), 0);
  return sum / points.length;
}

function depthFromScore(score: number, count: number): Difficulty {
  if (!count || score < 1.45) return "basic";
  if (score < 2.2) return "intermediate";
  return "advanced";
}

function compareShallowToDeep(a: LibraryCard, b: LibraryCard) {
  if (a.depthScore !== b.depthScore) return a.depthScore - b.depthScore;
  return a.title.localeCompare(b.title, "zh");
}

function clusterCards(cards: LibraryCard[], points: KnowledgePoint[]) {
  if (!cards.length) return [];
  const terms = new Map(
    cards.map((card) => [card.id, articleTerms(card, points.filter((item) => item.articleId === card.id))]),
  );
  const parent = new Map(cards.map((card) => [card.id, card.id]));
  const find = (id: string): string => {
    const next = parent.get(id) || id;
    if (next !== id) parent.set(id, find(next));
    return parent.get(id) || id;
  };
  const unite = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pb, pa);
  };

  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const left = terms.get(cards[i].id);
      const right = terms.get(cards[j].id);
      if (left && right && similar(left, right)) unite(cards[i].id, cards[j].id);
    }
  }

  const buckets = new Map<string, LibraryCard[]>();
  for (const card of cards) {
    const root = find(card.id);
    const list = buckets.get(root) || [];
    list.push(card);
    buckets.set(root, list);
  }

  return [...buckets.values()].map((members) => ({
    label: groupLabel(members, terms),
    articles: members,
  }));
}

function articleTerms(article: Article, points: KnowledgePoint[]) {
  const weights = new Map<string, number>();
  const add = (raw: string, weight: number) => {
    const term = raw.trim().toLowerCase();
    if (term.length < 2) return;
    weights.set(term, (weights.get(term) || 0) + weight);
  };

  const blob = `${article.title}\n${article.summary || ""}`.toLowerCase();
  for (const point of points) {
    add(point.name, 3);
    add(point.category, 2);
  }
  for (const word of blob.match(/[a-z][a-z0-9+().-]{1,24}/g) || []) add(word, 2);
  for (const direction of DIRECTIONS) {
    const hit = direction.keys.some(
      (key) => blob.includes(key) || points.some((point) => point.name.toLowerCase().includes(key)),
    );
    if (hit) add(direction.label, 8);
  }
  return weights;
}

function similar(a: Map<string, number>, b: Map<string, number>) {
  const sharedDirections = DIRECTIONS.filter((item) => a.has(item.label.toLowerCase()) && b.has(item.label.toLowerCase()));
  if (sharedDirections.length) return true;
  let shared = 0;
  let weight = 0;
  for (const [key, value] of a) {
    if (!b.has(key)) continue;
    shared += 1;
    weight += Math.min(value, b.get(key) || 0);
  }
  return shared >= 2 && weight >= 8;
}

function groupLabel(members: LibraryCard[], terms: Map<string, Map<string, number>>) {
  const hits = new Map<string, number>();
  for (const card of members) {
    const bag = terms.get(card.id);
    if (!bag) continue;
    for (const direction of DIRECTIONS) {
      const score = bag.get(direction.label.toLowerCase()) || 0;
      if (score) hits.set(direction.label, (hits.get(direction.label) || 0) + score);
    }
  }
  const named = [...hits.entries()].sort((a, b) => b[1] - a[1])[0];
  if (named) return named[0];
  if (members.length === 1) return members[0].title.replace(/[|｜].*$/, "").slice(0, 18) || "其他方向";
  return "相近方向";
}
