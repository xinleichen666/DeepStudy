export type ProviderId =
  | "deepseek"
  | "qwen"
  | "glm"
  | "moonshot"
  | "doubao"
  | "custom";

export type SourceType = "url" | "pdf";

export type Difficulty = "basic" | "intermediate" | "advanced";

export type MessageRole = "user" | "assistant";

export type Settings = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type Article = {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  text: string;
  html?: string;
  pageTexts: string[];
  pageCount: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
  extractedAt?: string;
};

export type KnowledgePoint = {
  id: string;
  articleId: string;
  name: string;
  category: string;
  definition: string;
  excerpt: string;
  question: string;
  difficulty: Difficulty;
  page?: number;
  discussed: boolean;
  lastAskedAt?: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  articleId: string;
  knowledgePointId: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  articleId: string;
  knowledgePointId: string;
  role: MessageRole;
  content: string;
  mentionedKnowledgeIds: string[];
  createdAt: string;
};

export type KnowledgeMention = {
  id: string;
  knowledgePointId: string;
  relatedKnowledgePointId?: string;
  articleId: string;
  conversationId: string;
  messageId: string;
  excerpt: string;
  createdAt: string;
};

export type Database = {
  settings: Settings;
  articles: Article[];
  knowledgePoints: KnowledgePoint[];
  conversations: Conversation[];
  messages: ChatMessage[];
  mentions: KnowledgeMention[];
};

export type ArticleDetail = {
  article: Article;
  knowledgePoints: KnowledgePoint[];
  conversations: Conversation[];
  messages: ChatMessage[];
};

export type KnowledgeTraceItem = {
  point: KnowledgePoint;
  article: Pick<Article, "id" | "title" | "sourceType" | "updatedAt">;
  conversation: Conversation | null;
  messages: ChatMessage[];
  related: Array<Pick<KnowledgePoint, "id" | "name" | "articleId">>;
  mentionCount: number;
};
