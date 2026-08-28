import Link from "next/link";
import { BookOpen, Library, Settings, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "文库", icon: Library },
  { href: "/knowledge", label: "知识谱", icon: Waypoints },
  { href: "/settings", label: "API", icon: Settings },
];

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: "library" | "knowledge" | "settings" | "read";
}) {
  return (
    <div className="desk-bg min-h-screen">
      <div className="pointer-events-none grain" />
      <aside className="rail">
        <Link href="/" className="brand">
          <span className="seal">研</span>
          <span>
            <strong>研迹</strong>
            <em>DeepStudy</em>
          </span>
        </Link>
        <nav>
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive =
              (active === "library" && item.href === "/") ||
              (active === "knowledge" && item.href === "/knowledge") ||
              (active === "settings" && item.href === "/settings");
            return (
              <Link key={item.href} href={item.href} className={cn("rail-link", isActive && "active")}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="rail-foot">
          <BookOpen size={14} />
          读文 · 问知 · 可追溯
        </p>
      </aside>
      <main className="stage">{children}</main>
    </div>
  );
}
