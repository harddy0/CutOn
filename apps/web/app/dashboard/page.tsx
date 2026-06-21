"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getDashboardSummary,
  getDashboardLearning,
  getDashboardQuizzes,
  getDashboardRag,
  searchQuery,
  ApiError,
} from "@/lib/api";
import type {
  DashboardSummaryResponse,
  DashboardLearningResponse,
  DashboardQuizResponse,
  DashboardRagResponse,
  QueryResultItem,
} from "@/lib/api";
import { BrainLogo } from "@/components/icons/brain-logo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d: { msg: string }) => d.msg).join(", ");
    if (typeof detail === "object" && detail !== null) return JSON.stringify(detail);
    return `Request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ---------------------------------------------------------------------------
// Combined dashboard data
// ---------------------------------------------------------------------------

interface DashboardData {
  total_topics: number;
  total_journals: number;
  journals_last_7_days: number;
  journals_embedded: number;
  total_sources: number;
  total_chunks: number;
  chunks_embedded: number;
  total_quizzes: number;
  avg_quiz_score: number;
  active_sessions: number;
  total_sessions: number;
  unread_notifications: number;
  total_rag_queries: number;
  rag_positive_rate: number;
}

// ---------------------------------------------------------------------------
// Stat card colors
// ---------------------------------------------------------------------------

const STATS = [
  { key: "topics", label: "Topics", href: "/dashboard/topics", accent: "text-blue-accent", gradient: "from-blue-start to-blue-end", icon: "folder", countKey: "total_topics" as const, sub: null },
  { key: "sources", label: "Documents", href: "/dashboard/sources", accent: "text-green-accent", gradient: "from-green-start to-green-end", icon: "file", countKey: "total_sources" as const, sub: (s: DashboardData) => `${s.total_chunks} chunk${s.total_chunks !== 1 ? "s" : ""}` },
  { key: "journal", label: "Journal Entries", href: "/dashboard/journal", accent: "text-purple-accent", gradient: "from-purple-start to-purple-end", icon: "note", countKey: "total_journals" as const, sub: (s: DashboardData) => `${s.journals_last_7_days} this week` },
  { key: "sessions", label: "Study Sessions", href: "/dashboard/study", accent: "text-green-accent", gradient: "from-green-start to-green-end", icon: "chat", countKey: "total_sessions" as const, sub: (s: DashboardData) => s.active_sessions > 0 ? `${s.active_sessions} active` : null },
  { key: "quizzes", label: "Quizzes", href: "/dashboard/quizzes", accent: "text-blue-accent", gradient: "from-blue-start to-blue-end", icon: "quiz", countKey: "total_quizzes" as const, sub: (s: DashboardData) => s.total_quizzes > 0 ? `${(s.avg_quiz_score * 100).toFixed(0)}% avg` : null },
  { key: "queries", label: "RAG Queries", accent: "text-purple-accent", gradient: "from-purple-start to-purple-end", icon: "search", countKey: "total_rag_queries" as const, sub: (s: DashboardData) => s.total_rag_queries > 0 ? `${(s.rag_positive_rate * 100).toFixed(0)}% positive` : null },
] as const;

const STAT_ICONS: Record<string, React.ReactNode> = {
  folder: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 4h5l2 2h7v8H2V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  file: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 2h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  note: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 3h12v12H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 2h12v11H8l-4 3v-3H3V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  quiz: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 9l1.5 1.5L11.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  document_chunk: { label: "Doc", cls: "bg-gradient-to-r from-blue-start to-blue-end text-blue-accent" },
  journal_entry: { label: "Journal", cls: "bg-gradient-to-r from-purple-start to-purple-end text-purple-accent" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // ── Stats (fetched in parallel from split endpoints) ──
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Query ──
  const [query, setQuery] = useState("");
  const [queryResults, setQueryResults] = useState<QueryResultItem[] | null>(null);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  // ── Error ──
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch stats from split endpoints in parallel
  // ------------------------------------------------------------------

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setError(null);
    try {
      const [summary, learning, quiz, rag] = await Promise.all([
        getDashboardSummary(),
        getDashboardLearning(),
        getDashboardQuizzes(),
        getDashboardRag(),
      ]);
      setStats({
        total_topics: summary.total_topics,
        total_sources: summary.total_sources,
        total_sessions: summary.total_sessions,
        active_sessions: summary.active_sessions,
        unread_notifications: summary.unread_notifications,
        total_journals: learning.total_journals,
        journals_last_7_days: learning.journals_last_7_days,
        journals_embedded: learning.journals_embedded,
        total_chunks: learning.total_chunks,
        chunks_embedded: learning.chunks_embedded,
        total_quizzes: quiz.total_quizzes,
        avg_quiz_score: quiz.avg_quiz_score,
        total_rag_queries: rag.total_rag_queries,
        rag_positive_rate: rag.rag_positive_rate,
      });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ------------------------------------------------------------------
  // Handle query
  // ------------------------------------------------------------------

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setQueryLoading(true);
    setQueryError(null);
    setQueryResults(null);
    setQueryAnswer(null);
    setShowResults(true);

    try {
      const res = await searchQuery({ query: q, top_k: 7, synthesize: true });
      setQueryResults(res.results);
      setQueryAnswer(res.answer);
    } catch (err: unknown) {
      setQueryError(extractErrorMessage(err));
    } finally {
      setQueryLoading(false);
    }
  }, [query]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ════════════════════════════════════════
          GREETING + SEARCH
          ════════════════════════════════════════ */}
      <div className="relative overflow-hidden mb-8 rounded-[4px] bg-surface border-2 border-ink shadow-hard p-6 md:p-8">
        {/* Decorative bg */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/40 via-blue-start/20 to-purple-start/30" />
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-gradient-to-br from-green-start/20 to-green-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden md:block animate-float-slow pointer-events-none select-none" />

        <div className="flex items-start gap-4 flex-wrap">
          <div className="hidden sm:block">
            <BrainLogo size={40} className="animate-float" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-3xl font-black tracking-tight text-ink animate-fade-up">
              Your Knowledge Base
            </h1>
            <p className="text-sm font-mono text-ink-muted mt-1 animate-fade-up-1">
              Search across your documents and journal entries, or browse your learning stats below.
            </p>
          </div>
        </div>

        {/* ── AI Search bar ── */}
        <form onSubmit={handleSearch} className="mt-5 animate-fade-up-2">
          <div className="relative group">
            {/* Glow ring on focus */}
            <div className="absolute -inset-0.5 rounded-[6px] bg-gradient-to-r from-green-accent/0 via-green-accent/20 to-purple-accent/20 opacity-0 group-focus-within:opacity-100 blur-sm transition-opacity duration-500" />

            <div className="relative flex items-center bg-canvas border-2 border-ink rounded-[4px] shadow-hard transition-all duration-200 group-focus-within:shadow-[4px_4px_0px_0px_var(--color-green-accent)]">
              {/* AI icon */}
              <div className="absolute left-3.5 pointer-events-none flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-green-accent">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="12" cy="8" r="1.5" fill="currentColor" className="animate-pulse" />
                </svg>
                <span className="text-[10px] font-mono font-bold text-green-accent uppercase tracking-widest border-r border-border-subtle pr-2.5">
                  AI
                </span>
              </div>

              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything — search docs, journals, and notes..."
                className="flex-1 h-14 pl-[5.5rem] pr-24 bg-transparent text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none transition-all"
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                {queryLoading ? (
                  <span className="flex items-center gap-1.5 h-9 px-3 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end shadow-hard">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : (
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="h-9 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M5 1v10M1 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Search
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* AI capability hints */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5 px-1">
            <span className="text-[10px] font-mono font-bold text-ink-muted/50 uppercase tracking-wider">Try:</span>
            {["What is React Context?", "Explain state management", "My notes on Python errors"].map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => { setQuery(hint); }}
                className="px-2 py-1 rounded-[4px] border border-border-subtle text-[10px] font-mono font-medium text-ink-muted/60 hover:border-ink hover:text-ink hover:bg-card-hover transition-all"
              >
                {hint}
              </button>
            ))}
          </div>
        </form>

        {/* ── Query results ── */}
        {showResults && (
          <div className="mt-4 border-t border-border-subtle pt-4 animate-fade-up">
            {queryLoading ? (
              <div className="py-6 flex flex-col items-center justify-center gap-3">
                {/* Neural loading animation */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-green-accent/30 animate-ping" style={{ animationDuration: "2s" }} />
                  <div className="absolute inset-2 rounded-full border-2 border-blue-accent/30 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.3s" }} />
                  <div className="absolute inset-4 rounded-full border-2 border-purple-accent/30 animate-ping" style={{ animationDuration: "3s", animationDelay: "0.6s" }} />
                  <div className="absolute inset-[14px] rounded-full bg-gradient-to-br from-green-accent via-blue-accent to-purple-accent animate-pulse border border-ink" style={{ animationDuration: "1.5s" }} />
                  <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-green-accent border border-ink animate-ping" style={{ animationDuration: "1s", animationDelay: "0.2s" }} />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-blue-accent border border-ink animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.5s" }} />
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-accent border border-ink animate-ping" style={{ animationDuration: "1.4s", animationDelay: "0.8s" }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-ink-muted">Searching your knowledge base</span>
                  <span className="w-1 h-1 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-blue-accent animate-bounce border border-ink" style={{ animationDelay: "200ms" }} />
                  <span className="w-1 h-1 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "400ms" }} />
                </div>
                <span className="text-[9px] font-mono text-ink-muted/40">Searching documents &amp; journal entries...</span>
              </div>
            ) : queryError ? (
              <div className="rounded-[4px] border border-red-400 bg-red-50 p-3">
                <p className="text-xs font-mono font-bold text-red-600">{queryError}</p>
              </div>
            ) : queryAnswer || (queryResults && queryResults.length > 0) ? (
              <>
                {/* Synthesized answer */}
                {queryAnswer && (
                  <div className="mb-3 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start/40 to-green-end/20 p-3.5">
                    <span className="text-[10px] font-mono font-bold text-green-accent uppercase tracking-wider">Answer</span>
                    <p className="text-sm font-medium text-ink/85 leading-relaxed mt-1 whitespace-pre-wrap">{queryAnswer}</p>
                  </div>
                )}

                {/* Results */}
                {queryResults && queryResults.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                      {queryResults.length} result{queryResults.length !== 1 ? "s" : ""}
                    </span>
                    {queryResults.slice(0, 5).map((item, i) => {
                      const src = SOURCE_LABELS[item.source_type] ?? { label: item.source_type, cls: "bg-card-hover text-ink-muted" };
                      return (
                        <div key={i} className="rounded-[4px] border border-border-subtle bg-canvas p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider ${src.cls}`}>
                              {src.label}
                            </span>
                            <span className="text-[9px] font-mono text-ink-muted/50">
                              {(item.score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <p className="text-xs font-medium text-ink/70 leading-relaxed line-clamp-2">{item.text}</p>
                        </div>
                      );
                    })}
                    {queryResults.length > 5 && (
                      <p className="text-[10px] font-mono text-ink-muted/50 text-center">
                        +{queryResults.length - 5} more results
                      </p>
                    )}
                  </div>
                )}

                {/* Collapse */}
                <button
                  onClick={() => setShowResults(false)}
                  className="mt-3 text-[10px] font-mono font-bold text-ink-muted hover:text-ink transition-colors"
                >
                  Clear results
                </button>
              </>
            ) : (
              <p className="text-xs font-mono text-ink-muted/60 py-2 text-center">No results found.</p>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          METRICS GRID
          ════════════════════════════════════════ */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-blue-accent animate-pulse border border-ink" />
          <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
            Knowledge Base Overview
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
            <p className="text-xs font-mono font-bold text-red-600">{error}</p>
          </div>
        )}

        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            {STATS.map((s) => (
              <div key={s.key} className="rounded-[4px] bg-surface border-2 border-ink p-4 md:p-5 shadow-hard animate-pulse">
                <div className="h-8 w-16 bg-card-hover rounded-[2px]" />
                <div className="h-3 w-20 bg-card-hover rounded-[2px] mt-3" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            {STATS.map((s, i) => {
              const count = stats[s.countKey];
              const subText = s.sub ? s.sub(stats) : null;
              const hasHref = "href" in s && s.href;
              const content = (
                <div
                  className={`rounded-[4px] bg-surface border-2 border-ink p-4 md:p-5 shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px] ${
                    hasHref ? "cursor-pointer" : ""
                  }`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-2xl md:text-3xl font-black tracking-tight ${s.accent}`}>
                      {count}
                    </span>
                    <span className={`${s.accent} opacity-60`}>
                      {STAT_ICONS[s.icon]}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm font-black text-ink">{s.label}</p>
                  {subText && (
                    <span className="text-[10px] font-mono text-ink-muted/60 mt-0.5 block">{subText}</span>
                  )}
                </div>
              );

              if (hasHref) {
                return <Link key={s.key} href={s.href}>{content}</Link>;
              }
              return <div key={s.key}>{content}</div>;
            })}
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════
          QUICK ACTIONS
          ════════════════════════════════════════ */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
          <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
            Quick Actions
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "New Topic", href: "/dashboard/topics", desc: "Create a learning topic", gradient: "from-blue-start to-blue-end", accent: "text-blue-accent" },
            { label: "Upload Document", href: "/dashboard/sources", desc: "Add a PDF or TXT", gradient: "from-green-start to-green-end", accent: "text-green-accent" },
            { label: "Write Journal", href: "/dashboard/journal", desc: "Log your reflections", gradient: "from-purple-start to-purple-end", accent: "text-purple-accent" },
            { label: "Study Session", href: "/dashboard/study", desc: "Chat with AI tutor", gradient: "from-green-start to-green-end", accent: "text-green-accent" },
          ].map((action) => (
            <Link key={action.label} href={action.href}>
              <div className={`rounded-[4px] bg-gradient-to-br ${action.gradient} border-2 border-ink p-4 shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px]`}>
                <p className={`text-sm font-black tracking-tight ${action.accent}`}>{action.label}</p>
                <p className="text-[11px] font-mono font-medium text-ink-muted/70 mt-0.5">{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Footer note ── */}
      <div className="mt-8 pt-4 border-t border-border-subtle flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-accent border border-ink" />
          <span className="text-[10px] font-mono text-ink-muted/50">
            All data is sourced from your personal knowledge repository
          </span>
        </div>
        <BrainLogo size={16} className="opacity-30" />
      </div>
    </div>
  );
}
