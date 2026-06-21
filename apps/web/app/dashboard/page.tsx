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
  // ── Stats (fetched in parallel) ──
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
