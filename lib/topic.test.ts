import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOverviewPrompt,
  buildTopicChatMessages,
  formatLibraryContext,
  normalizeTopicTitle,
  parseTopicOverview,
  selectLibraryContext,
  type LibraryBrief,
} from "./topic.ts";

const topic = "薄膜铌酸锂偏振分束旋转器逆向设计";

const articles: LibraryBrief[] = [
  {
    id: "ln",
    title: "薄膜铌酸锂偏振分束器的逆向设计",
    summary: "提出一种偏振分束旋转器。",
    updatedAt: "2024-01-01T00:00:00.000Z",
    points: [{ name: "偏振分束", definition: "将正交偏振分开" }],
  },
  {
    id: "cnn",
    title: "卷积神经网络图像分类",
    summary: "在自然图像上比较几种网络。",
    updatedAt: "2025-06-01T00:00:00.000Z",
  },
  {
    id: "body",
    title: "组会周报",
    summary: "本周进度。",
    updatedAt: "2023-01-01T00:00:00.000Z",
    textSample: "我们讨论了薄膜铌酸锂偏振分束旋转器的相位匹配与模式耦合。",
  },
  {
    id: "weak",
    title: "光学系统设计笔记",
    summary: "几何光学复习。",
    updatedAt: "2022-01-01T00:00:00.000Z",
  },
];

test("normalizeTopicTitle trims and caps length", () => {
  assert.equal(normalizeTopicTitle("  薄膜  铌酸锂  "), "薄膜 铌酸锂");
  assert.equal(normalizeTopicTitle(" 光 "), "");
  assert.equal(normalizeTopicTitle("铌".repeat(90)).length, 80);
});

test("selectLibraryContext prefers papers that share the topic", () => {
  const library = selectLibraryContext(topic, articles);
  const ids = library.matched.map((item) => item.id);
  assert.ok(ids.includes("ln"));
  assert.ok(ids.includes("body"));
  assert.equal(ids.includes("cnn"), false);
  assert.equal(ids.includes("weak"), false);
  assert.equal(ids[0], "ln");
  assert.ok(library.catalog.some((item) => item.id === "cnn"));
  assert.equal(library.catalog.some((item) => item.id === "ln"), false);
});

test("selectLibraryContext matches English device terms and ignores a forced unrelated id", () => {
  const english = selectLibraryContext("thin-film lithium niobate polarization splitter", [
    { id: "tfln", title: "Thin-film lithium niobate modulators", summary: "Electro-optic devices.", updatedAt: "2024-02-01" },
    { id: "other", title: "Weekly lab notes", summary: "Unrelated logistics.", updatedAt: "2024-03-01" },
  ], { preferIds: ["other"] });
  assert.deepEqual(english.matched.map((item) => item.id), ["tfln"]);
});

test("formatLibraryContext does not invent a library when nothing matches", () => {
  const text = formatLibraryContext(selectLibraryContext("完全无关的课题名称", []));
  assert.match(text, /没有明显对得上/);
});

test("parseTopicOverview reads fenced JSON and ignores model-supplied ids", () => {
  const overview = parseTopicOverview(
    `说明如下：
\`\`\`json
{
  "background": "薄膜铌酸锂可以把电光调制做进片上，偏振分束旋转器要在很短的长度里把偏振转成想要的基。",
  "concepts": [
    {"name": "模式耦合", "principle": "相邻波导通过倏逝场交换功率，$\\\\kappa$ 决定耦合长度。"},
    {"name": "偏振旋转", "explanation": "混合模式把 TE 与 TM 连起来。"}
  ],
  "methods": [{"name": "伴随法", "summary": "一次正演和一次伴随得到全参数梯度。"}],
  "state_of_the_art": "片上分束已经能做高消光，宽带和工艺偏差仍不稳定。",
  "open_problems": ["如何把消光比和带宽同时写进目标", "如何把消光比和带宽同时写进目标"],
  "reading": [{"title": "伴随法优化片上偏振器件", "why": "先看梯度怎么反传", "keywords": ["adjoint", "adjoint"]}],
  "keywords": ["薄膜铌酸锂", "薄膜铌酸锂", "逆向设计"]
}
\`\`\``,
    ["paper-1", "paper-1", "paper-2"],
    "2026-10-07T00:00:00.000Z",
  );
  assert.equal(overview.concepts.length, 2);
  assert.equal(overview.concepts[1]?.principle.includes("TE"), true);
  assert.equal(overview.stateOfArt.includes("消光"), true);
  assert.deepEqual(overview.openProblems, ["如何把消光比和带宽同时写进目标"]);
  assert.deepEqual(overview.keywords, ["薄膜铌酸锂", "逆向设计"]);
  assert.deepEqual(overview.reading[0]?.keywords, ["adjoint"]);
  assert.deepEqual(overview.usedArticleIds, ["paper-1", "paper-2"]);
  assert.equal(overview.generatedAt, "2026-10-07T00:00:00.000Z");
});

test("parseTopicOverview rejects an empty payload", () => {
  assert.throws(() => parseTopicOverview('{"background":"太短"}', [], "2026-01-01"), /完整的课题概览/);
});

test("overview prompt keeps the topic, a library title, and the no-fabrication rule", () => {
  const library = selectLibraryContext(topic, articles);
  const prompt = buildOverviewPrompt(topic, library);
  const user = prompt.map((turn) => turn.content).join("\n");
  assert.match(user, /薄膜铌酸锂偏振分束旋转器逆向设计/);
  assert.match(user, /薄膜铌酸锂偏振分束器的逆向设计/);
  assert.match(user, /不要编造/);
});

test("topic chat keeps the overview and earlier turns", () => {
  const overview = parseTopicOverview(
    JSON.stringify({
      background: "这是一个足够长的背景说明，用来描述薄膜铌酸锂上的偏振操控要解决什么问题。",
      concepts: [
        { name: "模式耦合", principle: "倏逝场交换功率。" },
        { name: "逆向设计", principle: "用梯度更新结构。" },
      ],
      methods: [],
      stateOfArt: "宽带仍难。",
      openProblems: ["带宽和消光比互相牵制"],
      reading: [],
      keywords: ["铌酸锂"],
    }),
    [],
    "2026-01-01T00:00:00.000Z",
  );
  const messages = buildTopicChatMessages({
    title: topic,
    overview,
    library: selectLibraryContext(topic, articles),
    history: [
      { role: "user", content: "瓶颈是什么？" },
      { role: "assistant", content: "宽带和工艺偏差。" },
    ],
    userMessage: "那目标函数怎么写？",
  });
  const blob = messages.map((turn) => turn.content).join("\n");
  assert.match(blob, /瓶颈是什么/);
  assert.match(blob, /宽带和工艺偏差/);
  assert.match(blob, /那目标函数怎么写/);
  assert.match(blob, /模式耦合/);
  assert.equal(messages.at(-1)?.content, "那目标函数怎么写？");
});
