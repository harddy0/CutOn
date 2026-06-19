"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listTopics,
  listSources,
  uploadSource,
  deleteSource,
  listChunks,
  ApiError,
} from "@/lib/api";
import type {
  TopicResponse,
  SourceResponse,
  DocumentChunkResponse,
} from "@/lib/api";

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CHUNKING_STATUS_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  COMPLETED: { bg: "bg-gradient-to-r from-green-start to-green-end", text: "text-green-accent", bar: "bg-green-accent" },
  PROCESSING: { bg: "bg-gradient-to-r from-blue-start to-blue-end", text: "text-blue-accent", bar: "bg-blue-accent" },
  PENDING: { bg: "bg-gradient-to-r from-purple-start to-purple-end", text: "text-purple-accent", bar: "bg-purple-accent" },
  FAILED: { bg: "bg-red-50", text: "text-red-500", bar: "bg-red-500" },
};

function SourceStatusBadge({ status }: { status: string }) {
  const s = CHUNKING_STATUS_STYLES[status] ?? { bg: "bg-gradient-to-r from-purple-start to-purple-end", text: "text-purple-accent", bar: "bg-purple-accent" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-ink text-[10px] font-mono font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full border border-ink ${s.bar} ${status === "PROCESSING" ? "animate-pulse" : ""}`} />
      {status.toLowerCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  // ── Data ──
  const [topics, setTopics] = useState<TopicResponse[]>([]);
  const [sources, setSources] = useState<SourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter ──
  const [selectedTopicId, setSelectedTopicId] = useState<string | "all">("all");

  // ── Upload ──
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTopicId, setUploadTopicId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Delete ──
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Chunks ──
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Record<string, DocumentChunkResponse[]>>({});
  const [chunksLoading, setChunksLoading] = useState<Record<string, boolean>>({});

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topicData, sourceData] = await Promise.all([
        listTopics(),
        listSources(selectedTopicId !== "all" ? { topic_id: selectedTopicId } : undefined),
      ]);
      setTopics(topicData);
      setSources(sourceData);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedTopicId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Upload
  // ------------------------------------------------------------------

  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTopicId) return;

    // Validate file type
    const ext = uploadFile.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt"].includes(ext)) {
      setError("Only PDF and TXT files are supported.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await uploadSource({ topic_id: uploadTopicId, file: uploadFile });
      setUploadFile(null);
      setUploadTopicId("");
      setShowUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadTopicId, fetchData]);

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = useCallback(async (sourceId: string) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteSource(sourceId);
      setDeletingId(null);
      // Clean up cached chunks
      setChunks((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Chunks (expand/collapse)
  // ------------------------------------------------------------------

  const handleToggleChunks = useCallback(async (sourceId: string) => {
    if (expandedSourceId === sourceId) {
      setExpandedSourceId(null);
      return;
    }

    setExpandedSourceId(sourceId);

    // Load chunks if not cached
    if (!chunks[sourceId]) {
      setChunksLoading((prev) => ({ ...prev, [sourceId]: true }));
      setError(null);
      try {
        const data = await listChunks(sourceId);
        setChunks((prev) => ({ ...prev, [sourceId]: data }));
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
      } finally {
        setChunksLoading((prev) => ({ ...prev, [sourceId]: false }));
      }
    }
  }, [expandedSourceId, chunks]);

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
          <h1 className="text-2xl font-black tracking-tight text-ink">Documents</h1>
          <p className="text-sm font-mono text-ink-muted">
            Uploaded PDFs and text files — parsed, chunked, and embedded.
          </p>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {showUpload ? "Cancel" : "Upload"}
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

      {/* ── Upload form ── */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="mb-6 rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard"
        >
          <div className="space-y-4">
            {/* Topic selector */}
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Topic
              </label>
              <div className="relative">
                <select
                  value={uploadTopicId}
                  onChange={(e) => setUploadTopicId(e.target.value)}
                  required
                  className="w-full h-10 px-3 pr-8 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all appearance-none"
                >
                  <option value="">Select a topic…</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted"
                >
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {topics.length === 0 && (
                <p className="text-[11px] font-mono text-ink-muted/60 mt-1">
                  You need to create a topic first before uploading documents.
                </p>
              )}
            </div>

            {/* File picker */}
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                File (PDF or TXT)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center gap-2 h-10 px-3 bg-surface border-2 border-ink rounded-[4px] cursor-pointer hover:bg-card-hover transition-colors">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-ink-muted">
                    <path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className={`text-sm font-medium truncate ${uploadFile ? "text-ink" : "text-ink-muted/40"}`}>
                    {uploadFile ? uploadFile.name : "Choose a file…"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
                {uploadFile && (
                  <button
                    type="button"
                    onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="shrink-0 text-xs font-mono font-bold text-ink-muted hover:text-ink underline underline-offset-2 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading || !uploadFile || !uploadTopicId}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              {uploading ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-pulse border border-ink" />
                  Uploading…
                </>
              ) : (
                "Upload Document"
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── Sources list ── */}
      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center">
          <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
          <span className="text-sm font-mono font-bold text-ink-muted">Loading documents…</span>
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-[4px] bg-surface border-2 border-ink p-10 shadow-hard text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 1v10M6 7l4 4 4-4" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 14v3h16v-3" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-mono font-bold text-ink-muted mb-1">
            {topics.length === 0
              ? "No topics or documents yet"
              : "No documents for this topic"}
          </p>
          <p className="text-xs font-mono text-ink-muted/60">
            {topics.length === 0
              ? "Create a topic first, then upload PDFs or TXT files here."
              : "Click &quot;Upload&quot; to add your first document."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sources.map((source) => {
            const isDeleting = deletingId === source.id;
            const isExpanded = expandedSourceId === source.id;
            const isLoadingChunks = chunksLoading[source.id];
            const sourceChunks = chunks[source.id];
            const statusStyle = CHUNKING_STATUS_STYLES[source.chunking_status] ?? { bg: "", text: "text-ink-muted", bar: "bg-ink-muted" };

            return (
              <div
                key={source.id}
                className="rounded-[4px] bg-surface border-2 border-ink shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                {/* ── Source header ── */}
                <div className="px-5 pt-4 pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* File icon */}
                      <div className="shrink-0 w-8 h-8 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M4 1h4l4 4v7a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="#1A1A1A" strokeWidth="1.3" strokeLinejoin="round" />
                          <path d="M8 1v4h4" stroke="#1A1A1A" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black tracking-tight text-ink truncate">
                          {source.original_filename}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono font-bold text-ink-muted/60 uppercase tracking-wider">
                            {source.file_type.toUpperCase()}
                          </span>
                          <span className="text-[11px] font-mono text-ink-muted/40">·</span>
                          <span className="text-[11px] font-mono text-ink-muted/60">
                            {formatFileSize(source.file_size)}
                          </span>
                          <span className="text-[11px] font-mono text-ink-muted/40">·</span>
                          <span className="text-[11px] font-mono font-bold text-blue-accent truncate">
                            {getTopicName(source.topic_id)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <SourceStatusBadge status={source.chunking_status} />
                      {/* Delete */}
                      {isDeleting ? (
                        <div className="flex gap-1 ml-1">
                          <button
                            onClick={() => handleDelete(source.id)}
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
                          onClick={() => setDeletingId(source.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-red-400 hover:bg-red-50 transition-all"
                          title="Delete document"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 3h8M4.5 3V1.5h3V3M9.5 3l-.5 7.5H3L2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Progress bar ── */}
                <div className="px-5 pt-3 pb-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-ink-muted/50 uppercase tracking-wider">
                      Chunking progress
                    </span>
                    <span className="text-[10px] font-mono font-bold text-ink-muted/50">
                      {source.chunking_status === "COMPLETED"
                        ? `${source.total_chunks} chunks`
                        : source.chunking_status === "PROCESSING"
                          ? `Processing…`
                          : `${source.total_chunks} chunks total`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-[4px] border border-ink bg-canvas overflow-hidden">
                    <div
                      className={`h-full rounded-[2px] border-r border-ink transition-all duration-500 ${statusStyle.bar}`}
                      style={{
                        width: `${source.chunking_status === "COMPLETED" ? 100 : source.chunking_status === "PROCESSING" ? 60 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* ── Date + expand chunks ── */}
                <div className="px-5 pb-3 pt-2 flex items-center justify-between border-t border-border-subtle mt-3">
                  <span className="text-[11px] font-mono font-bold text-ink-muted/50">
                    {formatDate(source.ingested_at)}
                  </span>
                  <button
                    onClick={() => handleToggleChunks(source.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-ink-muted hover:text-ink transition-colors"
                  >
                    {isExpanded ? "Hide chunks" : `View ${source.total_chunks} chunk${source.total_chunks !== 1 ? "s" : ""}`}
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                {/* ── Chunk list (expandable) ── */}
                {isExpanded && (
                  <div className="border-t border-border-subtle">
                    <div className="px-5 py-4 space-y-3">
                      {isLoadingChunks ? (
                        <div className="flex items-center gap-2 py-4 justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-pulse border border-ink" />
                          <span className="text-xs font-mono font-bold text-ink-muted">Loading chunks…</span>
                        </div>
                      ) : sourceChunks && sourceChunks.length > 0 ? (
                        sourceChunks.map((chunk) => (
                          <div
                            key={chunk.id}
                            className="rounded-[4px] border border-border-subtle bg-canvas p-3"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                                Chunk #{chunk.chunk_index}
                              </span>
                              <div className="flex items-center gap-2">
                                {chunk.page_number > 0 && (
                                  <span className="text-[10px] font-mono text-ink-muted/60">
                                    p.{chunk.page_number}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono text-ink-muted/40">
                                  {chunk.tokens ?? "—"} tokens
                                </span>
                                <EmbeddingBadge status={chunk.embedding_status} />
                              </div>
                            </div>
                            <p className="text-xs font-medium text-ink/70 leading-relaxed line-clamp-3 font-mono">
                              {chunk.text}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-mono text-ink-muted/60 text-center py-4">
                          No chunks available yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embedding badge (reuse from journal page pattern)
// ---------------------------------------------------------------------------

const EMBEDDING_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETED: { bg: "bg-gradient-to-r from-green-start to-green-end", text: "text-green-accent", dot: "bg-green-accent" },
  PROCESSING: { bg: "bg-gradient-to-r from-blue-start to-blue-end", text: "text-blue-accent", dot: "bg-blue-accent" },
  PENDING: { bg: "bg-gradient-to-r from-purple-start to-purple-end", text: "text-purple-accent", dot: "bg-purple-accent" },
  FAILED: { bg: "bg-red-50", text: "text-red-500", dot: "bg-red-500" },
};

function EmbeddingBadge({ status }: { status: string }) {
  const s = EMBEDDING_STYLES[status] ?? { bg: "bg-gradient-to-r from-purple-start to-purple-end", text: "text-purple-accent", dot: "bg-purple-accent" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-ink text-[10px] font-mono font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full border border-ink ${s.dot} ${status === "PROCESSING" ? "animate-pulse" : ""}`} />
      {status.toLowerCase()}
    </span>
  );
}
