import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { TopicDesk } from "@/components/TopicDesk";

export const dynamic = "force-dynamic";

export default function TopicsPage() {
  return (
    <AppShell active="topics">
      <Suspense fallback={<p className="page-pad muted">正在打开课题知识…</p>}>
        <TopicDesk />
      </Suspense>
    </AppShell>
  );
}
