import Link from "next/link";
import { BookOpen, Compass, Library, Settings, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "文库", icon: Library },
  { href: "/topics", label: "课题知识", icon: Compass },
  { href: "/knowledge", label: "知识谱", icon: Waypoints },
  { href: "/settings", label: "API", icon: Settings },
];

function isNavActive(active: string, href: string) {
  return (
    (active === "library" && href === "/") ||
    (active === "topics" && href === "/topics") ||
    (active === "knowledge" && href === "/knowledge") ||
    (active === "settings" && href === "/settings")
  );
}

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: "library" | "topics" | "knowledge" | "settings" | "read";
}) {
  const links = (size: number) =>
    NAV.map((item) => {
      const Icon = item.icon;
      return (
        <Link key={item.href} href={item.href} className={cn("rail-link", isNavActive(active, item.href) && "active")}>
          <Icon size={size} />
          {item.label}
        </Link>
      );
    });

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
        <nav>{links(18)}</nav>
        <p className="rail-foot">
          <BookOpen size={14} />
          读文 · 问知 · 可追溯
        </p>
      </aside>
      <main className="stage">
        <nav className="mobile-nav" aria-label="页面">
          {links(16)}
        </nav>
        {children}
      </main>
    </div>
  );
}
