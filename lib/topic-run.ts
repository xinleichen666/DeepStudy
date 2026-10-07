import { generateTopicOverview } from "./llm";
import { selectLibraryContext } from "./topic";
import { getSettings, getTopicDetail, listLibraryBriefs, saveTopicOverview } from "./store";
import { nowIso } from "./utils";

export async function regenerateTopicOverview(id: string) {
  const detail = await getTopicDetail(id);
  if (!detail) throw new Error("课题不存在");
  const settings = await getSettings();
  const library = selectLibraryContext(detail.topic.title, await listLibraryBriefs(), {
    preferIds: detail.topic.overview?.usedArticleIds,
  });
  const overview = await generateTopicOverview(settings, detail.topic.title, library, nowIso());
  return saveTopicOverview(id, overview);
}
