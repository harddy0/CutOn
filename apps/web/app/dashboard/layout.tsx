"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrainLogo } from "@/components/icons/brain-logo";
import { clearAccessToken } from "@/lib/api";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Topics", href: "/dashboard/topics" },
  { label: "Documents", href: "/dashboard/sources" },
  { label: "Journal", href: "/dashboard/journal" },
  { label: "Study", href: "/dashboard/study" },
  { label: "Quizzes", href: "/dashboard/quizzes" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = useCallback(() => {
    clearAccessToken();
    router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── TOP NAV ── */}
      <nav className="w-full bg-surface border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Row 1: Logo + Logout */}
          <div className="h-12 md:h-14 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
              <BrainLogo size={22} className="md:size-[24px] transition-transform duration-200 group-hover:scale-110" />
              <span className="text-sm md:text-base font-black tracking-tight text-ink">
                CutOn
              </span>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>

          {/* Row 2: Nav links — scrollable on mobile */}
          <div className="flex overflow-x-auto gap-1 pb-2.5 md:pb-0 md:flex-wrap -mx-4 md:mx-0 px-4 md:px-0 scrollbar-hide">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 px-3 py-1.5 rounded-[4px] text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                    isActive
                      ? "bg-ink text-white"
                      : "text-ink-muted hover:text-ink hover:bg-card-hover"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── PAGE CONTENT ── */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
