"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  listTopics,
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  ApiError,
} from "@/lib/api";
import type { TopicResponse, JournalEntryResponse } from "@/lib/api";

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateShort(iso);
}

function estimateReadingTime(text: string): string {
  if (!text.trim()) return "1 min read";
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

function getWordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Writing streak
// ---------------------------------------------------------------------------

function computeStreak(entries: JournalEntryResponse[]): number {
  if (entries.length === 0) return 0;
  const uniqueDates = entries
    .map((e) => {
      const d = new Date(e.created_at);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => b - a);

  const today = new Date();
  const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayTs = todayTs - 86400000;

  const mostRecent = uniqueDates[0]!;
  if (mostRecent !== todayTs && mostRecent !== yesterdayTs) return 0;

  let streak = 1;
  let prevDate = mostRecent;
  for (let i = 1; i < uniqueDates.length; i++) {
    const currDate = uniqueDates[i]!;
    if (prevDate - currDate === 86400000) {
      streak++;
      prevDate = currDate;
    } else {
      break;
    }
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Date grouping (chronological order)
// ---------------------------------------------------------------------------

function getDateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (entryDate.getTime() === today.getTime()) return "Today";
  if (entryDate.getTime() === yesterday.getTime()) return "Yesterday";

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (entryDate >= weekAgo) return "This Week";

  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  if (entryDate >= monthAgo) return "This Month";

  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "This Month"];

function getGroupPriority(label: string): number {
  const idx = GROUP_ORDER.indexOf(label);
  return idx >= 0 ? idx : 99;
}

// Sort chronologically: Today → Yesterday → This Week → This Month → older months (by date)
function sortGroups(a: string, b: string): number {
  const pa = getGroupPriority(a);
  const pb = getGroupPriority(b);
  if (pa !== pb) return pa - pb;
  // For month-year labels, sort by actual date descending
  const aDate = new Date(a + " 1");
  const bDate = new Date(b + " 1");
  if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
    return bDate.getTime() - aDate.getTime();
  }
  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Embedding badge
// ---------------------------------------------------------------------------

const EMBEDDING_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETED:  { bg: "bg-gradient-to-r from-green-start to-green-end", text: "text-green-accent", dot: "bg-green-accent" },
  PROCESSING: { bg: "bg-gradient-to-r from-blue-start to-blue-end", text: "text-blue-accent", dot: "bg-blue-accent" },
  PENDING:    { bg: "bg-gradient-to-r from-purple-start to-purple-end", text: "text-purple-accent", dot: "bg-purple-accent" },
  FAILED:     { bg: "bg-red-50", text: "text-red-500", dot: "bg-red-500" },
};

function EmbeddingBadge({ status }: { status: string }) {
  const style = EMBEDDING_STATUS_STYLES[status] ?? {
    bg: "bg-gradient-to-r from-purple-start to-purple-end",
    text: "text-purple-accent",
    dot: "bg-purple-accent",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-ink text-[10px] font-mono font-bold uppercase tracking-wider ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full border border-ink ${style.dot} ${status === "PROCESSING" ? "animate-pulse" : ""}`} />
      {status.toLowerCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Writing prompts that rotate
// ---------------------------------------------------------------------------

const WRITING_PROMPTS = [
  "What did you learn today?",
  "What clicked? What confused you?",
  "Summarize a concept in your own words…",
  "What would you explain to a peer?",
  "What debugging triumph happened?",
  "Connect two ideas you studied…",
  "What question do you still have?",
];

// ---------------------------------------------------------------------------
// Topic accent colors for the left bar
// ---------------------------------------------------------------------------

const TOPIC_COLORS = [
  "border-l-green-accent",
  "border-l-blue-accent",
  "border-l-purple-accent",
  "border-l-green-accent/60",
  "border-l-blue-accent/60",
  "border-l-purple-accent/60",
];

function getTopicColor(topicId: string): string {
  let hash = 0;
  for (let i = 0; i < topicId.length; i++) {
    hash = ((hash << 5) - hash) + topicId.charCodeAt(i);
  }
  return TOPIC_COLORS[Math.abs(hash) % TOPIC_COLORS.length]!;
}

// ---------------------------------------------------------------------------
// Scroll Observer hook
// ---------------------------------------------------------------------------

function useScrollInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ---------------------------------------------------------------------------
// Entry card component
// ---------------------------------------------------------------------------

function EntryCard({
  entry,
  index,
  topicName,
  accentColor,
  isEditing,
  editContent,
  isDeleting,
  isExpanded,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  setEditContent,
  setDeletingId,
  setExpandedId,
  deleting,
}: {
  entry: JournalEntryResponse;
  index: number;
  topicName: string;
  accentColor: string;
  isEditing: boolean;
  editContent: string;
  isDeleting: boolean;
  isExpanded: boolean;
  onStartEdit: (entry: JournalEntryResponse) => void;
  onCancelEdit: () => void;
  onSaveEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  setEditContent: (v: string) => void;
  setDeletingId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  deleting: boolean;
}) {
  const { ref, visible } = useScrollInView();

  return (
    <div
      ref={ref}
      className={`relative rounded-[4px] bg-surface border-2 border-ink shadow-hard transition-all duration-200 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px] border-l-4 ${accentColor} ${
        visible ? "animate-scale-in" : "opacity-0"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ── Entry header ── */}
      <div className="pl-4 pr-5 pt-4 pb-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink bg-gradient-to-br from-blue-start to-blue-end text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
              {topicName}
            </span>
            <EmbeddingBadge status={entry.embedding_status} />
          </div>
          <div className="flex items-center gap-1">
            {/* Expand / collapse */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              >
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Edit */}
            {!isEditing && (
              <button
                onClick={() => onStartEdit(entry)}
                className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all"
                title="Edit entry"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M8.5 1.5l2 2L5 9H3V7l5.5-5.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {/* Delete */}
            {isDeleting ? (
              <div className="flex gap-1">
                <button
                  onClick={() => onDelete(entry.id)}
                  disabled={deleting}
                  className="h-7 px-2 rounded-[4px] border-2 border-ink bg-red-100 text-ink font-bold text-[10px] shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  {deleting ? "…" : "Yes"}
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="h-7 px-2 rounded-[4px] border-2 border-ink text-ink font-bold text-[10px] hover:bg-card-hover transition-all"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeletingId(entry.id)}
                className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-red-400 hover:bg-red-50 transition-all"
                title="Delete entry"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M4.5 3V1.5h3V3M9.5 3l-.5 7.5H3L2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Entry content ── */}
      <div className="pl-4 pr-5 py-4">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={5}
              className="w-full px-3 py-2.5 bg-canvas border-2 border-ink rounded-[4px] text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple-accent/30 resize-y min-h-[100px]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => onSaveEdit(entry.id)}
                disabled={!editContent.trim()}
                className="flex-1 h-9 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="h-9 px-4 rounded-[4px] border-2 border-ink text-ink font-bold text-sm hover:bg-card-hover transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`text-sm font-medium text-ink/85 leading-relaxed whitespace-pre-wrap transition-all duration-300 ${
                isExpanded ? "" : "line-clamp-4"
              }`}
              style={{ wordBreak: "break-word" }}
            >
              {entry.content}
            </div>
            {/* Expand/collapse hint */}
            {entry.content.split("\n").length > 5 || entry.content.length > 500 ? (
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="mt-2 text-[11px] font-mono font-bold text-purple-accent hover:text-ink transition-colors"
              >
                {isExpanded ? "Show less ▲" : "Read more ▼"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* ── Entry footer ── */}
      <div className="pl-4 pr-5 pb-3 flex items-center justify-between border-t border-border-subtle pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-ink-muted/50">
            {formatTimeAgo(entry.created_at)}
          </span>
          <span className="text-[9px] font-mono text-ink-muted/30">·</span>
          <span className="text-[10px] font-mono text-ink-muted/40">
            {getWordCount(entry.content)} words
          </span>
          <span className="text-[9px] font-mono text-ink-muted/30">·</span>
          <span className="text-[10px] font-mono text-ink-muted/40">
            {estimateReadingTime(entry.content)}
          </span>
        </div>
        {entry.created_at !== entry.updated_at && (
          <span className="text-[10px] font-mono text-ink-muted/40 italic">
            edited {formatDateShort(entry.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shimmer loading state
// ---------------------------------------------------------------------------

function ShimmerCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-[4px] border-2 border-ink bg-surface shadow-hard p-5 animate-shimmer"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-16 h-5 rounded-[4px] bg-ink/5" />
        <div className="w-20 h-5 rounded-[4px] bg-ink/5" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="w-full h-4 rounded-[2px] bg-ink/5" />
        <div className="w-3/4 h-4 rounded-[2px] bg-ink/5" />
        <div className="w-1/2 h-4 rounded-[2px] bg-ink/5" />
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-border-subtle">
        <div className="w-12 h-3 rounded-[2px] bg-ink/5" />
        <div className="w-16 h-3 rounded-[2px] bg-ink/5" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function JournalPage() {
  // ── Data ──
  const [topics, setTopics] = useState<TopicResponse[]>([]);
  const [entries, setEntries] = useState<JournalEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter ──
  const [selectedTopicId, setSelectedTopicId] = useState<string | "all">("all");

  // ── Pagination ──
  const [skip, setSkip] = useState(0);
  const limit = 100;
  const [total, setTotal] = useState(0);

  // Reset pagination when topic filter changes
  useEffect(() => {
    setSkip(0);
  }, [selectedTopicId]);

  // ── Create ──
  const [showCreate, setShowCreate] = useState(false);
  const [newTopicId, setNewTopicId] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const createFormRef = useRef<HTMLFormElement>(null);

  // Auto-scroll to form when opened
  useEffect(() => {
    if (showCreate && createFormRef.current) {
      setTimeout(() => {
        createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [showCreate]);

  // Rotate prompt every 4 seconds when create form is open
  useEffect(() => {
    if (!showCreate) return;
    const interval = setInterval(() => {
      setPromptIndex((i) => (i + 1) % WRITING_PROMPTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [showCreate]);

  // ── Edit ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // ── Delete ──
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Expanded view ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Date groups ──
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, JournalEntryResponse[]>();
    for (const entry of entries) {
      const label = getDateGroupLabel(entry.created_at);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(entry);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => sortGroups(a, b));
  }, [entries]);

  // ── Stats ──
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = entries.filter((e) => new Date(e.created_at) >= weekAgo).length;
    const totalWords = entries.reduce((sum, e) => sum + getWordCount(e.content), 0);
    const avgWords = entries.length > 0 ? Math.round(totalWords / entries.length) : 0;
    const streak = computeStreak(entries);
    const embedded = entries.filter((e) => e.embedding_status === "COMPLETED").length;
    // Most active topic
    const topicCounts = new Map<string, number>();
    for (const e of entries) {
      topicCounts.set(e.topic_id, (topicCounts.get(e.topic_id) ?? 0) + 1);
    }
    let mostActiveTopic = "";
    let maxCount = 0;
    for (const [tid, count] of topicCounts) {
      if (count > maxCount) { maxCount = count; mostActiveTopic = tid; }
    }
    const topicName = topics.find((t) => t.id === mostActiveTopic)?.name ?? null;
    return { total: entries.length, thisWeek, avgWords, streak, embedded, totalWords, mostActiveTopic: topicName };
  }, [entries, topics]);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topicData, entryData] = await Promise.all([
        listTopics(),
        listJournalEntries({
          ...(selectedTopicId !== "all" ? { topic_id: selectedTopicId } : {}),
          skip,
          limit,
        }),
      ]);
      setTopics(topicData.items);
      setEntries(entryData.items);
      setTotal(entryData.total);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedTopicId, skip, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Pagination handlers ──
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;
  const hasPrev = skip > 0;
  const hasNext = skip + limit < total;

  const goNext = useCallback(() => {
    if (hasNext) setSkip((s) => s + limit);
  }, [hasNext, limit]);

  const goPrev = useCallback(() => {
    if (hasPrev) setSkip((s) => Math.max(0, s - limit));
  }, [hasPrev, limit]);

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || !newTopicId) return;
    setCreating(true);
    setError(null);
    try {
      await createJournalEntry({ topic_id: newTopicId, content: newContent.trim() });
      setNewContent("");
      setNewTopicId("");
      setShowCreate(false);
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [newContent, newTopicId, fetchData]);

  // ------------------------------------------------------------------
  // Edit
  // ------------------------------------------------------------------

  const handleStartEdit = useCallback((entry: JournalEntryResponse) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
  }, []);

  const handleSaveEdit = useCallback(async (entryId: string) => {
    if (!editContent.trim()) return;
    setError(null);
    try {
      await updateJournalEntry(entryId, { content: editContent.trim() });
      setEditingId(null);
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [editContent, fetchData]);

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = useCallback(async (entryId: string) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteJournalEntry(entryId);
      setDeletingId(null);
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Topic name lookup
  // ------------------------------------------------------------------

  const getTopicName = useCallback(
    (topicId: string) => topics.find((t) => t.id === topicId)?.name ?? "Unknown Topic",
    [topics]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ════════════════════════════════════════
          HERO HEADER
          ════════════════════════════════════════ */}
      <div className={`relative overflow-hidden rounded-[4px] bg-surface border-2 border-ink shadow-hard ${showCreate ? 'p-3 md:p-4' : 'p-6 md:p-8'} ${showCreate ? 'mb-2' : 'mb-8'}`}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-start/50 via-blue-start/20 to-green-start/30" />
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-gradient-to-br from-purple-start/20 to-purple-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden md:block animate-float-slow pointer-events-none select-none" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-gradient-to-br from-green-start/20 to-blue-start/10 border-2 border-ink rounded-[4px] shadow-hard -rotate-6 hidden md:block animate-float pointer-events-none select-none" />
        <div className="absolute top-1/4 right-16 w-16 h-16 bg-gradient-to-br from-blue-start/20 to-purple-start/10 border-2 border-ink rounded-[4px] shadow-hard rotate-45 hidden lg:block animate-float-delayed pointer-events-none select-none" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] border border-ink bg-gradient-to-r from-purple-start to-purple-end">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3.5 4h5M3.5 6h5M3.5 8h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
                <span className="text-[10px] font-mono font-bold text-purple-accent uppercase tracking-wider">Journal</span>
              </span>
            </div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-purple-accent via-blue-accent to-green-accent bg-clip-text text-transparent animate-fade-up">
              Your Learning Journal
            </h1>
            <p className="text-sm font-mono text-ink-muted mt-1 animate-fade-up-1">
              Personal notes, reflections, and debugging logs — your second brain.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {showCreate ? "Cancel" : "New Entry"}
          </button>
        </div>

        {/* ── Quick stats bar ── */}
        {!loading && entries.length > 0 && (
          <div className={`border-t border-border-subtle animate-fade-up-2 ${showCreate ? 'mt-2 pt-2' : 'mt-5 pt-4'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <span className="text-lg font-black text-purple-accent">{stats.total}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Total entries</p>
              </div>
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <span className="text-lg font-black text-green-accent">{stats.thisWeek}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">This week</p>
              </div>
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <span className="text-lg font-black text-blue-accent">~{stats.avgWords}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Avg words</p>
              </div>
              {/* Streak */}
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <div className="flex items-center gap-1">
                  <span className="text-lg font-black text-orange-500">{stats.streak}</span>
                  {stats.streak >= 3 && (
                    <span className="text-sm animate-pulse">🔥</span>
                  )}
                </div>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">
                  {stats.streak === 1 ? "Day streak" : "Day streak"}
                </p>
              </div>
              {/* Embedded count */}
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <div className="flex items-center gap-1">
                  <span className="text-lg font-black text-ink">{stats.embedded}</span>
                  <span className="text-xs font-mono text-ink-muted/40">/ {stats.total}</span>
                </div>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Embedded</p>
              </div>
              {/* Most active topic */}
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5 col-span-2 md:col-span-1">
                <span className="text-lg font-black text-ink-muted truncate block">{stats.mostActiveTopic ?? "—"}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Most active</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3 animate-fade-up">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ── Topic filter ── */}
      <div className={`flex flex-wrap items-center gap-2 ${showCreate ? 'mb-2' : 'mb-5'}`}>
        <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mr-1">
          Filter:
        </span>
        <button
          onClick={() => setSelectedTopicId("all")}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-bold border-2 transition-all ${
            selectedTopicId === "all"
              ? "bg-gradient-to-r from-purple-start to-purple-end border-ink shadow-hard text-purple-accent"
              : "bg-surface text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {selectedTopicId === "all" && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            All
          </span>
        </button>
        {topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => setSelectedTopicId(topic.id)}
            className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-bold border-2 transition-all ${
              selectedTopicId === topic.id
                ? "bg-gradient-to-r from-blue-start to-blue-end border-ink shadow-hard text-blue-accent"
                : "bg-surface text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {selectedTopicId === topic.id && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {topic.name}
            </span>
          </button>
        ))}
      </div>

      {/* ── Create form ── */}
      {showCreate && (
        <form
          ref={createFormRef}
          onSubmit={handleCreate}
          className="sticky top-14 md:top-16 z-20 -mx-4 md:-mx-0 px-4 md:px-0 mb-4 rounded-[4px] bg-surface border-2 border-ink p-5 md:p-6 shadow-hard animate-scale-in"
        >
          <div className="space-y-4">
            {/* Topic selector */}
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                Topic
              </label>
              <div className="relative">
                <select
                  value={newTopicId}
                  onChange={(e) => setNewTopicId(e.target.value)}
                  required
                  className="w-full h-10 px-3 pr-8 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all appearance-none"
                >
                  <option value="">Select a topic…</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted"
                >
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {topics.length === 0 && (
                <p className="text-[11px] font-mono text-ink-muted/60 mt-1">
                  You need to create a topic first before writing journal entries.
                </p>
              )}
            </div>

            {/* Content with animated prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                  Entry
                </label>
                {newContent.trim() && (
                  <span className="text-[10px] font-mono text-ink-muted/50">
                    {getWordCount(newContent)} words · {estimateReadingTime(newContent)}
                  </span>
                )}
              </div>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={WRITING_PROMPTS[promptIndex]}
                required
                rows={6}
                className="w-full px-3 py-2.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/30 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all resize-y min-h-[120px]"
              />
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex gap-1">
                  {WRITING_PROMPTS.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full border border-ink transition-all duration-300 ${
                        i === promptIndex ? "bg-purple-accent scale-125" : "bg-border-subtle"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={creating || !newContent.trim() || !newTopicId}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {creating ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2h8v8H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        <path d="M4 4h4M4 6h4M4 8h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      </svg>
                      Save Entry
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── Entries list ── */}
      {loading ? (
        <div className="space-y-3">
          <ShimmerCard delay={0} />
          <ShimmerCard delay={100} />
          <ShimmerCard delay={200} />
          <ShimmerCard delay={300} />
        </div>
      ) : entries.length === 0 ? (
        <div className="relative overflow-hidden rounded-[4px] bg-surface border-2 border-ink p-10 md:p-14 shadow-hard text-center">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-start/30 via-blue-start/10 to-green-start/20" />
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-gradient-to-br from-purple-start/20 to-purple-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden md:block animate-float-slow pointer-events-none select-none" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-gradient-to-br from-green-start/20 to-blue-start/10 border-2 border-ink rounded-[4px] shadow-hard -rotate-6 hidden md:block animate-float pointer-events-none select-none" />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end mb-5 animate-float">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="3" width="16" height="18" rx="2" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 8h8M8 12h8M8 16h5" stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-lg font-black tracking-tight text-ink mb-1">
            {topics.length === 0
              ? "No topics or journal entries yet"
              : "No journal entries for this topic"}
          </p>
          <p className="text-sm font-mono text-ink-muted/70 mb-6 max-w-md mx-auto">
            {topics.length === 0
              ? "Create a topic first, then write your reflections here."
              : "Click the button above to write your first reflection."}
          </p>
          {topics.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Write Your First Entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {groupedEntries.map(([groupLabel, groupEntries]) => (
            <div key={groupLabel}>
              {/* ── Group header ── */}
              <div className="sticky top-14 md:top-16 z-10 flex items-center gap-2 mb-4 pb-2 border-b-2 border-ink bg-canvas/90 backdrop-blur-sm -mx-4 md:-mx-0 px-4 md:px-0">
                <span className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-accent to-blue-accent border border-ink animate-pulse" style={{ animationDuration: "3s" }} />
                <span className="text-[13px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                  {groupLabel}
                </span>
                <span className="text-[10px] font-mono text-ink-muted/40 ml-auto">
                  {groupEntries.length} entr{groupEntries.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              <div className="space-y-3">
                {groupEntries.map((entry, ei) => {
                  const isEditing = editingId === entry.id;
                  const isDeleting = deletingId === entry.id;
                  const isExpanded = expandedId === entry.id;
                  const accentColor = getTopicColor(entry.topic_id);

                  return (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      index={ei}
                      topicName={getTopicName(entry.topic_id)}
                      accentColor={accentColor}
                      isEditing={isEditing}
                      editContent={editContent}
                      isDeleting={isDeleting}
                      isExpanded={isExpanded}
                      onStartEdit={handleStartEdit}
                      onCancelEdit={handleCancelEdit}
                      onSaveEdit={handleSaveEdit}
                      onDelete={handleDelete}
                      setEditContent={setEditContent}
                      setDeletingId={setDeletingId}
                      setExpandedId={setExpandedId}
                      deleting={deleting}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && total > limit && (
        <div className="mt-8 flex items-center justify-between gap-3 border-t-2 border-border-subtle pt-4">
          <span className="text-[11px] font-mono font-bold text-ink-muted/50">
            {total} entr{total !== 1 ? "ies" : "y"} total
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-ink-muted/50">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={goPrev}
              disabled={!hasPrev}
              className="h-8 px-3 rounded-[4px] border-2 border-ink text-xs font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={!hasNext}
              className="h-8 px-3 rounded-[4px] border-2 border-ink bg-ink text-white text-xs font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
