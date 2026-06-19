"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  ApiError,
} from "@/lib/api";
import type { TopicResponse } from "@/lib/api";

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

  // ── Create form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

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
      const data = await listTopics();
      setTopics(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

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
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Topics</h1>
          <p className="text-sm font-mono text-ink-muted">
            Organize your learning into topic areas.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {showCreate ? "Cancel" : "New Topic"}
        </button>
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
          onSubmit={handleCreate}
          className="mb-6 rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard"
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
        <div className="flex items-center gap-2 py-16 justify-center">
          <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
          <span className="text-sm font-mono font-bold text-ink-muted">Loading topics…</span>
        </div>
      ) : topics.length === 0 ? (
        <div className="rounded-[4px] bg-surface border-2 border-ink p-10 shadow-hard text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M3 10h14" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-mono font-bold text-ink-muted mb-1">No topics yet</p>
          <p className="text-xs font-mono text-ink-muted/60">
            Click &quot;New Topic&quot; above to create your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic) => {
            const isEditing = editingId === topic.id;
            const isDeleting = deletingId === topic.id;

            return (
              <div
                key={topic.id}
                className="group rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px]"
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
    </div>
  );
}
