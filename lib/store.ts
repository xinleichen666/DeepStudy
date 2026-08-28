import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { DEFAULT_SETTINGS } from "./providers";
import type {
  Article,
  ChatMessage,
  Conversation,
  Database,
  KnowledgeMention,
  KnowledgePoint,
  Settings,
} from "./types";
import { dataDir } from "./data-dir";
import { nowIso } from "./utils";

const DATA_DIR = dataDir();
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "deepstudy.json");

const emptyDb = (): Database => ({
  settings: { ...DEFAULT_SETTINGS },
  articles: [],
  knowledgePoints: [],
  conversations: [],
  messages: [],
  mentions: [],
});

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function readDb(): Promise<Database> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      articles: parsed.articles ?? [],
      knowledgePoints: parsed.knowledgePoints ?? [],
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
      mentions: parsed.mentions ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const db = emptyDb();
      await writeDb(db);
      return db;
    }
    throw error;
  }
}

async function writeDb(db: Database) {
  await ensureDirs();
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  try {
    await fs.rename(tmp, DB_PATH);
  } catch {
    await fs.copyFile(tmp, DB_PATH);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export async function updateDb<T>(mutator: (db: Database) => T | Promise<T>) {
  return withLock(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
}

export async function getDb() {
  return withLock(() => readDb());
}

export function publicSettings(settings: Settings): Settings {
  return {
    ...settings,
    apiKey: settings.apiKey ? maskKey(settings.apiKey) : "",
  };
}

export function maskKey(key: string) {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function getSettings() {
  const db = await getDb();
  return db.settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  return updateDb((db) => {
    db.settings = { ...db.settings, ...patch };
    return db.settings;
  });
}

export async function listArticles() {
  const db = await getDb();
  return [...db.articles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getArticleDetail(id: string) {
  const db = await getDb();
  const article = db.articles.find((item) => item.id === id);
  if (!article) return null;
  return {
    article,
    knowledgePoints: db.knowledgePoints.filter((item) => item.articleId === id),
    conversations: db.conversations.filter((item) => item.articleId === id),
    messages: db.messages.filter((item) => item.articleId === id),
  };
}

export async function createArticle(
  input: Omit<Article, "id" | "createdAt" | "updatedAt" | "summary"> & {
    summary?: string;
  },
) {
  const stamp = nowIso();
  const article: Article = {
    ...input,
    id: nanoid(),
    summary: input.summary ?? "",
    createdAt: stamp,
    updatedAt: stamp,
  };
  await updateDb((db) => {
    db.articles.unshift(article);
  });
  return article;
}

export async function saveUpload(articleId: string, file: File) {
  await ensureDirs();
  const ext = path.extname(file.name) || ".pdf";
  const filePath = path.join(UPLOAD_DIR, `${articleId}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return { filePath, buffer };
}

export function getUploadPath(articleId: string, fileName?: string) {
  const ext = fileName ? path.extname(fileName) || ".pdf" : ".pdf";
  return path.join(UPLOAD_DIR, `${articleId}${ext}`);
}

export async function deleteArticle(id: string) {
  await updateDb(async (db) => {
    db.articles = db.articles.filter((item) => item.id !== id);
    db.knowledgePoints = db.knowledgePoints.filter((item) => item.articleId !== id);
    db.conversations = db.conversations.filter((item) => item.articleId !== id);
    db.messages = db.messages.filter((item) => item.articleId !== id);
    db.mentions = db.mentions.filter((item) => item.articleId !== id);
  });
  const filePath = getUploadPath(id);
  await fs.unlink(filePath).catch(() => undefined);
}

export async function replaceKnowledgePoints(
  articleId: string,
  points: Omit<KnowledgePoint, "id" | "articleId" | "createdAt" | "discussed">[],
) {
  const stamp = nowIso();
  return updateDb((db) => {
    const existing = db.knowledgePoints.filter((item) => item.articleId === articleId);
    const unused = [...points];
    const keptIds = new Set<string>();
    const merged: KnowledgePoint[] = [];

    const takeMatch = (name: string) => {
      const key = normalizeName(name);
      const index = unused.findIndex((item) => namesMatch(key, normalizeName(item.name)));
      if (index < 0) return null;
      return unused.splice(index, 1)[0];
    };

    for (const old of existing) {
      const incoming = takeMatch(old.name);
      if (incoming) {
        merged.push({
          ...old,
          name: incoming.name,
          category: incoming.category,
          definition: incoming.definition,
          excerpt: incoming.excerpt,
          question: incoming.question,
          difficulty: incoming.difficulty,
          page: incoming.page,
        });
        keptIds.add(old.id);
        continue;
      }
      if (old.discussed) {
        merged.push(old);
        keptIds.add(old.id);
      }
    }

    for (const incoming of unused) {
      merged.push({
        ...incoming,
        id: nanoid(),
        articleId,
        discussed: false,
        createdAt: stamp,
      });
    }

    db.knowledgePoints = [
      ...db.knowledgePoints.filter((item) => item.articleId !== articleId),
      ...merged,
    ];
    db.conversations = db.conversations.filter(
      (item) => item.articleId !== articleId || keptIds.has(item.knowledgePointId),
    );
    db.messages = db.messages.filter(
      (item) => item.articleId !== articleId || keptIds.has(item.knowledgePointId),
    );
    db.mentions = db.mentions.filter(
      (item) => item.articleId !== articleId || keptIds.has(item.knowledgePointId),
    );

    const article = db.articles.find((item) => item.id === articleId);
    if (article) {
      article.extractedAt = stamp;
      article.updatedAt = stamp;
    }
    return merged;
  });
}

export async function addKnowledgePoint(
  articleId: string,
  point: Omit<KnowledgePoint, "id" | "articleId" | "createdAt" | "discussed" | "lastAskedAt">,
) {
  const stamp = nowIso();
  return updateDb((db) => {
    const existing = db.knowledgePoints.find(
      (item) => item.articleId === articleId && normalizeName(item.name) === normalizeName(point.name),
    );
    if (existing) return existing;
    const created: KnowledgePoint = {
      ...point,
      id: nanoid(),
      articleId,
      discussed: false,
      createdAt: stamp,
    };
    db.knowledgePoints.push(created);
    const article = db.articles.find((item) => item.id === articleId);
    if (article) article.updatedAt = stamp;
    return created;
  });
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function namesMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 2 && longer.includes(shorter);
}

export async function updateArticleMeta(
  articleId: string,
  patch: Partial<Pick<Article, "title" | "summary" | "extractedAt">>,
) {
  await updateDb((db) => {
    const article = db.articles.find((item) => item.id === articleId);
    if (!article) return;
    Object.assign(article, patch, { updatedAt: nowIso() });
  });
}

export async function replaceArticleContent(
  articleId: string,
  patch: Partial<
    Pick<
      Article,
      | "title"
      | "sourceType"
      | "sourceUrl"
      | "fileName"
      | "mimeType"
      | "text"
      | "html"
      | "pageTexts"
      | "pageCount"
      | "extractedAt"
      | "summary"
    >
  >,
) {
  return updateDb((db) => {
    const article = db.articles.find((item) => item.id === articleId);
    if (!article) throw new Error("文章不存在");
    Object.assign(article, patch, { updatedAt: nowIso() });
    if ("extractedAt" in patch && !patch.extractedAt) delete article.extractedAt;
    return article;
  });
}

export async function getOrCreateConversation(articleId: string, knowledgePointId: string) {
  return updateDb((db) => {
    let conversation = db.conversations.find(
      (item) => item.articleId === articleId && item.knowledgePointId === knowledgePointId,
    );
    if (!conversation) {
      const stamp = nowIso();
      conversation = {
        id: nanoid(),
        articleId,
        knowledgePointId,
        createdAt: stamp,
        updatedAt: stamp,
      };
      db.conversations.push(conversation);
    }
    return conversation;
  });
}

export async function appendMessage(input: Omit<ChatMessage, "id" | "createdAt">) {
  const message: ChatMessage = {
    ...input,
    id: nanoid(),
    createdAt: nowIso(),
  };
  await updateDb((db) => {
    db.messages.push(message);
    const conversation = db.conversations.find((item) => item.id === input.conversationId);
    if (conversation) conversation.updatedAt = message.createdAt;
    const article = db.articles.find((item) => item.id === input.articleId);
    if (article) article.updatedAt = message.createdAt;
    const point = db.knowledgePoints.find((item) => item.id === input.knowledgePointId);
    if (point) {
      point.discussed = true;
      point.lastAskedAt = message.createdAt;
    }
  });
  return message;
}

export async function addMentions(mentions: Omit<KnowledgeMention, "id" | "createdAt">[]) {
  if (mentions.length === 0) return [];
  const stamp = nowIso();
  const created = mentions.map((item) => ({
    ...item,
    id: nanoid(),
    createdAt: stamp,
  }));
  await updateDb((db) => {
    db.mentions.push(...created);
  });
  return created;
}

export async function getKnowledgeTrace() {
  const db = await getDb();
  return db.knowledgePoints
    .map((point) => {
      const article = db.articles.find((item) => item.id === point.articleId);
      if (!article) return null;
      const conversation =
        db.conversations.find(
          (item) => item.knowledgePointId === point.id && item.articleId === point.articleId,
        ) ?? null;
      const messages = db.messages.filter((item) => item.knowledgePointId === point.id);
      const asked = point.discussed || messages.some((item) => item.role === "user");
      if (!asked) return null;
      const relatedIds = new Set(
        db.mentions
          .filter((item) => item.knowledgePointId === point.id && item.relatedKnowledgePointId)
          .map((item) => item.relatedKnowledgePointId as string),
      );
      const related = db.knowledgePoints
        .filter((item) => relatedIds.has(item.id))
        .map((item) => ({ id: item.id, name: item.name, articleId: item.articleId }));
      return {
        point,
        article: {
          id: article.id,
          title: article.title,
          sourceType: article.sourceType,
          updatedAt: article.updatedAt,
        },
        conversation,
        messages,
        related,
        mentionCount: db.mentions.filter((item) => item.knowledgePointId === point.id).length,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const aTime = a.point.lastAskedAt || a.point.createdAt;
      const bTime = b.point.lastAskedAt || b.point.createdAt;
      return bTime.localeCompare(aTime);
    });
}
