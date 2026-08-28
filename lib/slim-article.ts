import type { Article } from "@/lib/types";

export function slimArticleBody<T extends Article>(article: T): T {
  return {
    ...article,
    text: "",
    html: undefined,
    pageTexts: [],
  };
}
