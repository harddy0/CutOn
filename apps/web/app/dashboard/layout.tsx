"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BrainLogo } from "@/components/icons/brain-logo";
import { clearAccessToken, getMe, getUnreadNotificationCount, listNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/api";
import type { NotificationResponse } from "@/lib/api";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "grid" },
  { label: "Topics", href: "/dashboard/topics", icon: "folder" },
  { label: "Documents", href: "/dashboard/sources", icon: "file" },
  { label: "Journal", href: "/dashboard/journal", icon: "note" },
  { label: "Study", href: "/dashboard/study", icon: "chat" },
  { label: "Quizzes", href: "/dashboard/quizzes", icon: "quiz" },
];

const adminNavItem = { label: "Admin", href: "/dashboard/admin", icon: "admin" };

const NAV_ICONS: Record<string, React.ReactNode> = {
  grid: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  folder: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 3.5h5l2 2h4v7h-11v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 1.5h5l3.5 3.5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 1.5v3.5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  note: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  chat: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 1.5h10v9H7l-4 3v-3H2v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  quiz: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 7l1.5 1.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  admin: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L2 4v3c0 3.3 2 6.3 5 7 3-.7 5-3.7 5-7V4L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 7l1.5 1.5L9 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifAnchor, setNotifAnchor] = useState<HTMLElement | null>(null);

  // Fetch user role to conditionally show admin nav
  useEffect(() => {
    getMe()
      .then((user) => setUserRole(user.role))
      .catch(() => setUserRole(null));
  }, []);

  // Fetch notifications
  useEffect(() => {
    getUnreadNotificationCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
    listNotifications({ limit: 5 })
      .then(setNotifications)
      .catch(() => {});
  }, []);

  const allNavItems =
    userRole === "admin" ? [...navItems, adminNavItem] : navItems;

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  // Compensate for scrollbar disappearance to avoid layout shift
  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = useCallback(() => {
    clearAccessToken();
    router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* ════════════════════════════════════════
          TOP NAV BAR
          ════════════════════════════════════════ */}
      <nav className="sticky top-0 z-40 w-full bg-surface border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* ── Single row: Logo | Desktop nav | Logout ── */}
          <div className="h-14 md:h-16 flex items-center justify-between gap-2">
            {/* Left: Logo + Mobile hamburger */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Hamburger (mobile only) */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all"
                aria-label="Open navigation menu"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
                <BrainLogo size={22} className="md:size-[24px] transition-transform duration-200 group-hover:scale-110" />
                <span className="text-sm md:text-base font-black tracking-tight text-ink">
                  CutOn
                </span>
              </Link>
            </div>

            {/* Center: Desktop nav links */}
            <div className="hidden md:flex items-center gap-0.5">
              {allNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative group flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                      isActive
                        ? "text-ink"
                        : "text-ink-muted hover:text-ink hover:bg-card-hover"
                    }`}
                  >
                    <span className={`transition-colors ${
                      isActive ? "text-green-accent" : "text-ink-muted group-hover:text-ink"
                    }`}>
                      {NAV_ICONS[item.icon]}
                    </span>
                    {item.label}
                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-green-accent rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={(e) => { setNotifOpen(!notifOpen); setNotifAnchor(e.currentTarget); }}
                className="relative flex items-center justify-center w-9 h-9 rounded-[4px] border-2 border-transparent hover:border-border-subtle hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all"
                aria-label="Notifications"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5A4.5 4.5 0 003.5 6v2l-1.5 3h12l-1.5-3V6A4.5 4.5 0 008 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6 12.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 border border-ink text-[8px] font-black text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-surface border-2 border-ink rounded-[4px] shadow-hard overflow-hidden">
                    <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            await markAllNotificationsRead();
                            setUnreadCount(0);
                            setNotifications([]);
                          }}
                          className="text-[10px] font-mono font-bold text-ink-muted hover:text-ink underline underline-offset-2 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <p className="text-xs font-mono text-ink-muted/60">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n) => (
                          <div
                            key={n.id}
                            className={`px-3 py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-card-hover transition-colors ${!n.is_read ? 'bg-green-start/10' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-ink truncate">{n.title}</p>
                                <p className="text-[11px] font-medium text-ink-muted/80 line-clamp-2 mt-0.5">{n.message}</p>
                                <p className="text-[9px] font-mono text-ink-muted/40 mt-1">
                                  {new Date(n.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              {!n.is_read && (
                                <button
                                  onClick={async () => {
                                    await markNotificationRead(n.id);
                                    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
                                    setUnreadCount((prev) => Math.max(0, prev - 1));
                                  }}
                                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full border border-border-subtle text-ink-muted hover:text-ink hover:border-ink transition-colors"
                                  title="Mark as read"
                                >
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                    <path d="M1.5 4l1.5 1.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right: Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 h-9 px-3 rounded-[4px] border-2 border-transparent text-xs font-mono font-bold text-ink-muted hover:text-ink hover:border-border-subtle hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 1.5H2.5a1 1 0 00-1 1v7a1 1 0 001 1h2M8 8.5l3-3-3-3M11.5 5.5h-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
          MOBILE SIDE DRAWER
          ════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-surface border-r-2 border-ink shadow-hard overflow-hidden flex flex-col animate-slide-in-left">
            {/* Drawer header */}
            <div className="px-4 py-3.5 border-b-2 border-ink bg-gradient-to-r from-green-start/30 via-blue-start/20 to-purple-start/20 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2">
                <BrainLogo size={20} />
                <span className="text-sm font-black tracking-tight text-ink">CutOn</span>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all"
                aria-label="Close navigation menu"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-hide">
              {allNavItems.map((item, i) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-[4px] text-sm font-bold transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-green-start to-green-end text-ink border-2 border-ink shadow-hard"
                        : "text-ink-muted hover:text-ink hover:bg-card-hover border-2 border-transparent"
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span className={`shrink-0 ${isActive ? "text-green-accent" : "text-ink-muted"}`}>
                      {NAV_ICONS[item.icon]}
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-accent border border-ink" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Drawer footer with logout */}
            <div className="border-t-2 border-ink px-3 py-3 bg-canvas">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[4px] text-sm font-bold text-red-500 hover:bg-red-50 border-2 border-transparent hover:border-red-200 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M9 10l3-3-3-3M12 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          PAGE CONTENT
          ════════════════════════════════════════ */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
