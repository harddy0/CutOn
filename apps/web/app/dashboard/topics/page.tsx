"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  ApiError,
} from "@/lib/api";
import type { TopicResponse, PaginatedResponse } from "@/lib/api";

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TopicsPage() {
  const [topics, setTopics] = useState<TopicResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Pagination ──
  const [skip, setSkip] = useState(0);
  const limit = 100;
  const [total, setTotal] = useState(0);

  // ── Create form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);

  // Auto-scroll to form when opened
  useEffect(() => {
    if (showCreate && createFormRef.current) {
      setTimeout(() => {
        createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [showCreate]);

  // ── Edit state (tracking by id) ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // ── Delete confirm ──
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTopics({ skip, limit });
      setTopics(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [skip, limit]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

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
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createTopic({ name: newName.trim(), description: newDesc.trim() || null });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await fetchTopics();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, fetchTopics]);

  // ------------------------------------------------------------------
  // Edit
  // ------------------------------------------------------------------

  const handleStartEdit = useCallback((topic: TopicResponse) => {
    setEditingId(topic.id);
    setEditName(topic.name);
    setEditDesc(topic.description ?? "");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
  }, []);

  const handleSaveEdit = useCallback(async (topicId: string) => {
    if (!editName.trim()) return;
    setError(null);
    try {
      await updateTopic(topicId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      setEditingId(null);
      await fetchTopics();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [editName, editDesc, fetchTopics]);

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = useCallback(async (topicId: string) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteTopic(topicId);
      setDeletingId(null);
      await fetchTopics();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [fetchTopics]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ════════════════════════════════════════
          HERO HEADER
          ════════════════════════════════════════ */}
      <div className={`relative overflow-hidden rounded-[4px] bg-surface border-2 border-ink shadow-hard ${showCreate ? 'p-3 md:p-4' : 'p-6 md:p-8'} ${showCreate ? 'mb-2' : 'mb-8'}`}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/50 via-blue-start/20 to-purple-start/30" />
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-gradient-to-br from-green-start/20 to-green-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden md:block animate-float-slow pointer-events-none select-none" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-gradient-to-br from-blue-start/20 to-purple-start/10 border-2 border-ink rounded-[4px] shadow-hard -rotate-6 hidden md:block animate-float pointer-events-none select-none" />
        <div className="absolute top-1/4 left-16 w-16 h-16 bg-gradient-to-br from-green-start/20 to-blue-start/10 border-2 border-ink rounded-[4px] shadow-hard rotate-45 hidden lg:block animate-float-delayed pointer-events-none select-none" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] border border-ink bg-gradient-to-r from-green-start to-green-end">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 3h4l2 2h3v5.5h-9v-7.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <span className="text-[10px] font-mono font-bold text-green-accent uppercase tracking-wider">Topics</span>
              </span>
            </div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-green-accent via-blue-accent to-purple-accent bg-clip-text text-transparent animate-fade-up">
              Your Learning Topics
            </h1>
            <p className="text-sm font-mono text-ink-muted mt-1 animate-fade-up-1">
              Organize your knowledge into focused topic areas.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {showCreate ? "Cancel" : "New Topic"}
          </button>
        </div>

        {/* ── Quick stats bar ── */}
        {!loading && topics.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border-subtle animate-fade-up-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <span className="text-lg font-black text-green-accent">{total}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Total topics</p>
              </div>
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <span className="text-lg font-black text-blue-accent">{topics.filter((t) => t.description).length}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">With descriptions</p>
              </div>
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5">
                <div className="flex items-center gap-1">
                  <span className="text-lg font-black text-purple-accent">{topics.filter((t) => new Date(t.created_at) >= new Date(Date.now() - 7 * 86400000)).length}</span>
                </div>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">This week</p>
              </div>
              <div className="rounded-[4px] border border-border-subtle bg-canvas/50 p-2.5 overflow-hidden">
                <span className="text-lg font-black text-ink truncate block">{topics.length > 0 ? topics[0]?.name ?? '—' : '—'}</span>
                <p className="text-[10px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">Newest topic</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ── Create form ── */}
      {showCreate && (
        <form
          ref={createFormRef}
          onSubmit={handleCreate}
          className="sticky top-14 md:top-16 z-20 -mx-4 md:-mx-0 px-4 md:px-0 mb-4 rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard animate-scale-in"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. React Architecture"
                required
                className="w-full h-10 px-3 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Description (optional)
              </label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this topic"
                className="w-full h-10 px-3 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="w-full h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                {creating ? "Creating…" : "Create Topic"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Topics grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[4px] border-2 border-ink bg-surface shadow-hard p-5 animate-shimmer" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="w-24 h-5 rounded-[4px] bg-ink/5 mb-2" />
                  <div className="w-full h-3 rounded-[2px] bg-ink/5 mb-1" />
                  <div className="w-3/4 h-3 rounded-[2px] bg-ink/5" />
                </div>
                <div className="flex gap-1">
                  <div className="w-7 h-7 rounded-[4px] bg-ink/5" />
                  <div className="w-7 h-7 rounded-[4px] bg-ink/5" />
                </div>
              </div>
              <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                <div className="w-16 h-3 rounded-[2px] bg-ink/5" />
                <div className="w-12 h-3 rounded-[2px] bg-ink/5" />
              </div>
            </div>
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="relative overflow-hidden rounded-[4px] bg-surface border-2 border-ink p-10 md:p-14 shadow-hard text-center">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/30 via-blue-start/10 to-purple-start/20" />
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-gradient-to-br from-green-start/20 to-green-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden md:block animate-float-slow pointer-events-none select-none" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-gradient-to-br from-blue-start/20 to-purple-start/10 border-2 border-ink rounded-[4px] shadow-hard -rotate-6 hidden md:block animate-float pointer-events-none select-none" />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end mb-5 animate-float">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M2 6h8l2 2h9v12H3V6z" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 12h8M8 16h6" stroke="#1A1A1A" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-lg font-black tracking-tight text-ink mb-1">
            No topics yet
          </p>
          <p className="text-sm font-mono text-ink-muted/70 mb-6 max-w-md mx-auto">
            Create your first topic to start organizing your learning materials.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Create Your First Topic
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic, index) => {
            const isEditing = editingId === topic.id;
            const isDeleting = deletingId === topic.id;

            return (
              <div
                key={topic.id}
                className="group rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard transition-all duration-200 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px] animate-scale-in"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {isEditing ? (
                  /* ── Edit mode ── */
                  <div className="space-y-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full h-10 px-3 bg-canvas border-2 border-ink rounded-[4px] text-sm font-bold text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-blue-accent/30"
                      placeholder="Topic name"
                      autoFocus
                    />
                    <input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full h-9 px-3 bg-canvas border-2 border-ink rounded-[4px] text-xs font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-blue-accent/30"
                      placeholder="Description (optional)"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(topic.id)}
                        disabled={!editName.trim()}
                        className="flex-1 h-8 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="h-8 px-3 rounded-[4px] border-2 border-ink text-ink font-bold text-xs hover:bg-card-hover transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-black tracking-tight text-ink leading-tight flex-1 break-words">
                        {topic.name}
                      </h3>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Edit */}
                        <button
                          onClick={() => handleStartEdit(topic)}
                          className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all"
                          title="Edit topic"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8.5 1.5l2 2L5 9H3V7l5.5-5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {/* Delete */}
                        {isDeleting ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(topic.id)}
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
                            onClick={() => setDeletingId(topic.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-red-400 hover:bg-red-50 transition-all"
                            title="Delete topic"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 3h8M4.5 3V1.5h3V3M9.5 3l-.5 7.5H3L2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {topic.description && (
                      <p className="text-sm font-medium text-ink-muted/70 mt-1.5 leading-relaxed">
                        {topic.description}
                      </p>
                    )}

                    <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-ink-muted/50">
                        Created {formatDate(topic.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-blue-accent">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1" />
                          <path d="M5 3v2.5L7 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                        {formatDate(topic.updated_at)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && total > limit && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t-2 border-border-subtle pt-4">
          <span className="text-[11px] font-mono font-bold text-ink-muted/50">
            {total} topic{total !== 1 ? "s" : ""} total
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
