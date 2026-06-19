"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTopics,
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  ApiError,
} from "@/lib/api";
import type { TopicResponse, JournalEntryResponse, PaginatedResponse } from "@/lib/api";

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

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMBEDDING_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETED: {
    bg: "bg-gradient-to-r from-green-start to-green-end",
    text: "text-green-accent",
    dot: "bg-green-accent",
  },
  PROCESSING: {
    bg: "bg-gradient-to-r from-blue-start to-blue-end",
    text: "text-blue-accent",
    dot: "bg-blue-accent",
  },
  PENDING: {
    bg: "bg-gradient-to-r from-purple-start to-purple-end",
    text: "text-purple-accent",
    dot: "bg-purple-accent",
  },
  FAILED: {
    bg: "bg-red-50",
    text: "text-red-500",
    dot: "bg-red-500",
  },
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

  // ── Edit ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // ── Delete ──
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Expanded view ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Journal</h1>
          <p className="text-sm font-mono text-ink-muted">
            Personal notes, reflections, and debugging logs.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {showCreate ? "Cancel" : "New Entry"}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ── Topic filter ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mr-1">
          Filter:
        </span>
        <button
          onClick={() => setSelectedTopicId("all")}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-bold border-2 transition-all ${
            selectedTopicId === "all"
              ? "bg-ink text-white border-ink"
              : "bg-surface text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
          }`}
        >
          All
        </button>
        {topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => setSelectedTopicId(topic.id)}
            className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-bold border-2 transition-all ${
              selectedTopicId === topic.id
                ? "bg-ink text-white border-ink"
                : "bg-surface text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
            }`}
          >
            {topic.name}
          </button>
        ))}
      </div>

      {/* ── Create form ── */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard"
        >
          <div className="space-y-3">
            {/* Topic selector */}
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
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

            {/* Content */}
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Entry
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What did you learn? What clicked? What confused you?"
                required
                rows={5}
                className="w-full px-3 py-2.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all resize-y min-h-[100px]"
              />
            </div>

            <button
              type="submit"
              disabled={creating || !newContent.trim() || !newTopicId}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              {creating ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </form>
      )}

      {/* ── Entries list ── */}
      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center">
          <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink" />
          <span className="text-sm font-mono font-bold text-ink-muted">Loading entries…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[4px] bg-surface border-2 border-ink p-10 shadow-hard text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 3h12v14H4z" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M7 7h6M7 10h6M7 13h4" stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-mono font-bold text-ink-muted mb-1">
            {topics.length === 0
              ? "No topics or journal entries yet"
              : "No journal entries for this topic"}
          </p>
          <p className="text-xs font-mono text-ink-muted/60">
            {topics.length === 0
              ? "Create a topic first, then write your reflections here."
              : "Click &quot;New Entry&quot; to write your first reflection."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const isEditing = editingId === entry.id;
            const isDeleting = deletingId === entry.id;
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-[4px] bg-surface border-2 border-ink shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                {/* ── Entry header ── */}
                <div className="px-5 pt-4 pb-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink bg-gradient-to-br from-blue-start to-blue-end text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
                        {getTopicName(entry.topic_id)}
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
                          className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {/* Edit */}
                      {!isEditing && (
                        <button
                          onClick={() => handleStartEdit(entry)}
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
                            onClick={() => handleDelete(entry.id)}
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
                <div className="px-5 py-4">
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
                          onClick={() => handleSaveEdit(entry.id)}
                          disabled={!editContent.trim()}
                          className="flex-1 h-9 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="h-9 px-4 rounded-[4px] border-2 border-ink text-ink font-bold text-sm hover:bg-card-hover transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`text-sm font-medium text-ink/80 leading-relaxed whitespace-pre-wrap ${
                        isExpanded ? "" : "line-clamp-4"
                      }`}
                      style={{ wordBreak: "break-word" }}
                    >
                      {entry.content}
                    </div>
                  )}
                </div>

                {/* ── Entry footer ── */}
                <div className="px-5 pb-3 flex items-center justify-between border-t border-border-subtle pt-3">
                  <span className="text-[11px] font-mono font-bold text-ink-muted/50">
                    Created {formatDateFull(entry.created_at)}
                  </span>
                  {entry.created_at !== entry.updated_at && (
                    <span className="text-[10px] font-mono text-ink-muted/40">
                      edited {formatDate(entry.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && total > limit && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t-2 border-border-subtle pt-4">
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
