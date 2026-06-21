"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  getAdminRagStats,
  getDashboardActivity,
  ApiError,
} from "@/lib/api";
import type {
  UserResponse,
  CreateUserRequest,
  UpdateUserRequest,
  RAGStatsResponse,
  AuditLogResponse,
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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalMode = "create" | "edit" | null;

interface FormState {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: string;
  is_active: boolean;
}

const INITIAL_FORM: FormState = {
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  role: "user",
  is_active: true,
};

// ---------------------------------------------------------------------------
// Action label helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  deactivate: "Deactivated",
  login: "Logged in",
  register: "Registered",
  upload: "Uploaded",
  generate: "Generated",
  submit: "Submitted",
  search: "Searched",
  chat: "Chat",
  confirm: "Confirmed",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action.toLowerCase()] ?? action;
}

// ---------------------------------------------------------------------------
// Audit log row component
// ---------------------------------------------------------------------------

function AuditLogRow({ entry, index }: { entry: AuditLogResponse; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = entry.metadata ? Object.keys(entry.metadata).length > 0 : false;

  return (
    <div
      className="animate-fade-up border-b border-border-subtle last:border-b-0"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Mobile: card layout */}
      <div className="md:hidden p-4 hover:bg-card-hover transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ActionBadge action={entry.action} />
            <ResourceBadge type={entry.resource_type} />
          </div>
          <span className="text-[9px] font-mono text-ink-muted/40 shrink-0">
            {formatTimeAgo(entry.created_at)}
          </span>
        </div>
        <p className="text-xs font-medium text-ink/70 mt-1.5">
          {getActionLabel(entry.action)} {entry.resource_type}
          <span className="text-ink-muted/40"> — {entry.resource_id.slice(0, 8)}…</span>
        </p>
        <p className="text-[10px] font-mono text-ink-muted/40 mt-1">
          User: {entry.user_id.slice(0, 8)}…
        </p>
        {hasMetadata && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 text-[9px] font-mono font-bold text-blue-accent hover:text-blue-accent/80 transition-colors"
            >
              {expanded ? "Hide metadata" : "Show metadata"}
            </button>
            {expanded && (
              <pre className="mt-1.5 p-2 rounded-[2px] bg-canvas border border-border-subtle text-[9px] font-mono text-ink-muted/70 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>

      {/* Desktop: grid layout */}
      <div
        className={`hidden md:grid grid-cols-12 gap-2 px-5 py-3 hover:bg-card-hover transition-colors items-center ${hasMetadata ? "cursor-pointer" : ""}`}
        onClick={() => hasMetadata && setExpanded(!expanded)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && hasMetadata) { e.preventDefault(); setExpanded(!expanded); } }}
        role="button"
        tabIndex={hasMetadata ? 0 : -1}
      >
        <div className="col-span-2">
          <ActionBadge action={entry.action} />
        </div>
        <div className="col-span-2">
          <ResourceBadge type={entry.resource_type} />
        </div>
        <div className="col-span-3">
          <span className="text-[11px] font-medium text-ink-muted truncate block">
            {entry.resource_id.slice(0, 24)}…
            {hasMetadata && (
              <span className="ml-1.5 text-[9px] font-mono text-ink-muted/40">
                ({Object.keys(entry.metadata).length} meta)
              </span>
            )}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-[10px] font-mono text-ink-muted/50 truncate block" title={entry.user_id}>
            {entry.user_id.slice(0, 12)}…
          </span>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-blue-accent/60 border border-ink shrink-0" />
          <span className="text-[10px] font-mono text-ink-muted/50">
            {formatTimeAgo(entry.created_at)}
          </span>
        </div>

        {/* ── Expanded metadata row (spans full width) ── */}
        {expanded && hasMetadata && (
          <div className="col-span-full -mx-5 px-5 pb-3 pt-0 bg-canvas/50 border-t border-border-subtle mt-2">
            <pre className="p-2.5 rounded-[2px] bg-canvas border border-border-subtle text-[9px] font-mono text-ink-muted/70 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const a = action.toLowerCase();
  const isCreate = a === "create" || a === "upload" || a === "register" || a === "generate";
  const isDelete = a === "delete" || a === "deactivate";
  const isUpdate = a === "update" || a === "confirm";

  let cls = "bg-card-hover text-ink-muted border-border-subtle";
  if (isCreate) cls = "bg-gradient-to-r from-green-start to-green-end text-green-accent border-ink";
  else if (isDelete) cls = "bg-red-50 text-red-500 border-red-200";
  else if (isUpdate) cls = "bg-gradient-to-r from-blue-start to-blue-end text-blue-accent border-ink";

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider border ${cls}`}>
      {getActionLabel(action)}
    </span>
  );
}

function ResourceBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  let cls = "bg-card-hover text-ink-muted";
  if (t === "user") { cls = "bg-purple-start text-purple-accent"; }
  else if (t === "topic") { cls = "bg-blue-start text-blue-accent"; }
  else if (t === "source" || t === "document") { cls = "bg-green-start text-green-accent"; }
  else if (t === "journal" || t === "journal_entry") { cls = "bg-purple-start text-purple-accent"; }
  else if (t === "quiz") { cls = "bg-green-start text-green-accent"; }
  else if (t === "session" || t === "study_session") { cls = "bg-blue-start text-blue-accent"; }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider ${cls}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  // ── Users state ──
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Pagination (client-side) ──
  const [skip, setSkip] = useState(0);
  const limit = 10;
  const totalPages = Math.max(1, Math.ceil(users.length / limit));
  const currentPage = Math.floor(skip / limit) + 1;
  const hasPrev = skip > 0;
  const hasNext = skip + limit < users.length;
  const paginatedUsers = users.slice(skip, skip + limit);

  // ── Modal state ──
  const [modal, setModal] = useState<ModalMode>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Deactivate confirm ──
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // ── RAG stats ──
  const [ragStats, setRagStats] = useState<RAGStatsResponse | null>(null);
  const [ragStatsLoading, setRagStatsLoading] = useState(true);

  // ── Audit log ──
  const [auditLog, setAuditLog] = useState<AuditLogResponse[]>([]);
  const [auditLogLoading, setAuditLogLoading] = useState(true);
  const [auditLogError, setAuditLogError] = useState<string | null>(null);

  // ── Success flash ──
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch users
  // ------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ------------------------------------------------------------------
  // Fetch RAG stats
  // ------------------------------------------------------------------

  useEffect(() => {
    getAdminRagStats()
      .then(setRagStats)
      .catch(() => { /* RAG stats are optional */ })
      .finally(() => setRagStatsLoading(false));
  }, []);

  useEffect(() => {
    setSkip(0);
  }, [users.length]);

  // ------------------------------------------------------------------
  // Fetch audit log
  // ------------------------------------------------------------------

  const fetchAuditLog = useCallback(async () => {
    setAuditLogLoading(true);
    setAuditLogError(null);
    try {
      const data = await getDashboardActivity(20);
      setAuditLog(data.recent_activity);
    } catch (err: unknown) {
      setAuditLogError(extractErrorMessage(err));
    } finally {
      setAuditLogLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  // ------------------------------------------------------------------
  // Open modal for create / edit
  // ------------------------------------------------------------------

  const openCreateModal = useCallback(() => {
    setForm(INITIAL_FORM);
    setEditingUserId(null);
    setFormError(null);
    setModal("create");
  }, []);

  const openEditModal = useCallback((user: UserResponse) => {
    setForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    setEditingUserId(user.id);
    setFormError(null);
    setModal("edit");
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setEditingUserId(null);
    setForm(INITIAL_FORM);
    setFormError(null);
  }, []);

  // ------------------------------------------------------------------
  // Handle create / edit submit
  // ------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setSubmitting(true);

      try {
        if (modal === "create") {
          const createData: CreateUserRequest = {
            email: form.email,
            first_name: form.first_name,
            last_name: form.last_name,
            password: form.password,
          };
          await createUser(createData);
          setSuccessMsg(`User ${form.email} created successfully.`);
        } else if (modal === "edit" && editingUserId) {
          const updateData: UpdateUserRequest = {
            first_name: form.first_name || null,
            last_name: form.last_name || null,
            is_active: form.is_active,
            role: form.role,
          };
          await updateUser(editingUserId, updateData);
          setSuccessMsg(`User ${form.email} updated successfully.`);
        }
        closeModal();
        await fetchUsers();
      } catch (err: unknown) {
        setFormError(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [modal, form, editingUserId, closeModal, fetchUsers]
  );

  // ------------------------------------------------------------------
  // Handle deactivate
  // ------------------------------------------------------------------

  const handleDeactivate = useCallback(
    async (userId: string) => {
      setDeactivateError(null);
      setSubmitting(true);
      try {
        await deactivateUser(userId);
        setDeactivatingId(null);
        const user = users.find((u) => u.id === userId);
        setSuccessMsg(`User ${user?.email ?? userId} deactivated.`);
        await fetchUsers();
      } catch (err: unknown) {
        setDeactivateError(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [users, fetchUsers]
  );

  // ------------------------------------------------------------------
  // Clear flash message after 3s
  // ------------------------------------------------------------------

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ════════════════════════════════════════
          HEADER
          ════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink shrink-0" />
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-ink">
              Admin Dashboard
            </h1>
          </div>
          <p className="text-xs font-mono text-ink-muted mt-1">
            System overview and user management.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Create User
        </button>
      </div>

      {/* ════════════════════════════════════════
          RAG STATS CARD
          ════════════════════════════════════════ */}
      {!ragStatsLoading && ragStats && (
        <div className="mb-6 rounded-[4px] bg-surface border-2 border-ink shadow-hard p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-pulse border border-ink shrink-0" />
            <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
              RAG System Stats
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-[4px] bg-gradient-to-br from-blue-start to-blue-end border-2 border-ink p-3 shadow-hard">
              <span className="text-lg md:text-xl font-black tracking-tight text-blue-accent">{ragStats.total_queries}</span>
              <p className="text-[10px] font-mono font-bold text-ink-muted mt-0.5">Total Queries</p>
            </div>
            <div className="rounded-[4px] bg-gradient-to-br from-green-start to-green-end border-2 border-ink p-3 shadow-hard">
              <span className="text-lg md:text-xl font-black tracking-tight text-green-accent">{(ragStats.positive_rate * 100).toFixed(1)}%</span>
              <p className="text-[10px] font-mono font-bold text-ink-muted mt-0.5">Positive Rate</p>
            </div>
            <div className="rounded-[4px] bg-gradient-to-br from-purple-start to-purple-end border-2 border-ink p-3 shadow-hard">
              <span className="text-lg md:text-xl font-black tracking-tight text-purple-accent">{ragStats.avg_latency_ms.toFixed(0)}ms</span>
              <p className="text-[10px] font-mono font-bold text-ink-muted mt-0.5">Avg Latency</p>
            </div>
            <div className="rounded-[4px] bg-gradient-to-br from-blue-start to-blue-end border-2 border-ink p-3 shadow-hard">
              <span className="text-lg md:text-xl font-black tracking-tight text-blue-accent">{ragStats.total_rated}</span>
              <p className="text-[10px] font-mono font-bold text-ink-muted mt-0.5">Rated</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          USER MANAGEMENT HEADER
          ════════════════════════════════════════ */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink shrink-0" />
        <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
          User Management
        </span>
      </div>

      {/* ── Success flash ── */}
      {successMsg && (
        <div className="mb-4 rounded-[4px] border-2 border-green-accent bg-green-start p-3 animate-fade-up">
          <p className="text-xs font-mono font-bold text-ink">{successMsg}</p>
        </div>
      )}

      {/* ── Deactivate error ── */}
      {deactivateError && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{deactivateError}</p>
        </div>
      )}

      {/* ── Fetch error ── */}
      {error && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ════════════════════════════════════════
          USERS TABLE
          ════════════════════════════════════════ */}
      <div className="rounded-[4px] bg-surface border-2 border-ink shadow-hard overflow-hidden">
        {/* ── Table header ── */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-gradient-to-r from-purple-start/30 to-blue-start/30 border-b-2 border-ink text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Created</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
              <span className="text-xs font-mono font-bold text-ink-muted ml-1">Loading users…</span>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-mono text-ink-muted/60">No users found.</p>
          </div>
        ) : (
          /* ── User rows ── */
          <div>
            {paginatedUsers.map((user, i) => {
              const isDeactivating = deactivatingId === user.id;
              const isActive = user.is_active;
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-2 px-5 py-3.5 border-b border-border-subtle last:border-b-0 hover:bg-card-hover transition-colors items-center animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Mobile: card layout */}
                  <div className="md:hidden space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-ink">
                          {user.first_name} {user.last_name}
                        </span>
                        <span className="text-xs font-mono text-ink-muted block">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Role badge */}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider ${
                            user.role === "admin"
                              ? "bg-gradient-to-r from-purple-start to-purple-end text-purple-accent"
                              : "bg-card-hover text-ink-muted"
                          }`}
                        >
                          {user.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Status dot */}
                      <span
                        className={`w-1.5 h-1.5 rounded-full border border-ink ${
                          isActive ? "bg-green-accent" : "bg-red-400"
                        }`}
                      />
                      <span className="text-[10px] font-mono text-ink-muted/60">
                        {isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="text-[10px] font-mono text-ink-muted/40">
                        Created {formatDate(user.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => openEditModal(user)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] border border-border-subtle text-[10px] font-mono font-bold text-ink-muted hover:border-ink hover:text-ink hover:bg-card-hover transition-all"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M7.5 1l1.5 1.5-6 6L1 7.5l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                        Edit
                      </button>
                      {isActive && (
                        <button
                          onClick={() => setDeactivatingId(user.id)}
                          disabled={isDeactivating}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] border border-red-200 text-[10px] font-mono font-bold text-red-500 hover:bg-red-50 hover:border-red-400 transition-all disabled:opacity-40"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3h6M4 3V2a1 1 0 012 0v1M3 4v4a1 1 0 001 1h2a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Deactivate
                        </button>
                      )}
                      {!isActive && (
                        <span className="text-[10px] font-mono text-ink-muted/40 italic">Deactivated</span>
                      )}
                    </div>
                  </div>

                  {/* Desktop: grid cells */}
                  <div className="hidden md:flex md:col-span-3 items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-start to-blue-start border-2 border-ink flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-ink">
                        {user.first_name.charAt(0)}{user.last_name.charAt(0)}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-ink truncate">
                      {user.first_name} {user.last_name}
                    </span>
                  </div>
                  <div className="hidden md:block md:col-span-3">
                    <span className="text-xs font-mono text-ink-muted truncate block">{user.email}</span>
                  </div>
                  <div className="hidden md:block md:col-span-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider ${
                        user.role === "admin"
                          ? "bg-gradient-to-r from-purple-start to-purple-end text-purple-accent"
                          : "bg-card-hover text-ink-muted"
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                  <div className="hidden md:flex md:col-span-2 items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full border border-ink ${
                        isActive ? "bg-green-accent" : "bg-red-400"
                      }`}
                    />
                    <span className="text-[11px] font-mono text-ink-muted">
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="hidden md:block md:col-span-1">
                    <span className="text-[10px] font-mono text-ink-muted/50">{formatDate(user.created_at)}</span>
                  </div>
                  <div className="hidden md:flex md:col-span-1 items-center justify-end gap-1">
                    <button
                      onClick={() => openEditModal(user)}
                      className="w-7 h-7 flex items-center justify-center rounded-[2px] border border-border-subtle text-ink-muted hover:border-ink hover:bg-card-hover hover:text-ink transition-all"
                      title="Edit user"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M8.5 1.5l2 2-7 7-2.5.5.5-2.5 7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isActive && (
                      <button
                        onClick={() => setDeactivatingId(user.id)}
                        disabled={isDeactivating}
                        className="w-7 h-7 flex items-center justify-center rounded-[2px] border border-transparent text-ink-muted hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all disabled:opacity-40"
                        title="Deactivate user"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 4h7M4 4V3a1 1 0 011-1h2a1 1 0 011 1v1M3.5 5v4a1 1 0 001 1h3a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* ── Deactivate confirmation overlay (shown inline) ── */}
                  {deactivatingId === user.id && (
                    <div className="col-span-full md:col-span-12 bg-red-50 border-2 border-red-400 rounded-[4px] p-3 mt-2 animate-fade-up">
                      <p className="text-xs font-mono font-bold text-red-600 mb-2">
                        Deactivate {user.first_name} {user.last_name} ({user.email})?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeactivate(user.id)}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border-2 border-red-400 bg-red-100 text-red-600 font-bold text-xs hover:bg-red-200 active:translate-x-[1px] active:translate-y-[1px] transition-all disabled:opacity-40"
                        >
                          {submitting ? (
                            <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            "Yes, deactivate"
                          )}
                        </button>
                        <button
                          onClick={() => { setDeactivatingId(null); setDeactivateError(null); }}
                          disabled={submitting}
                          className="px-3 py-1.5 rounded-[4px] border-2 border-border-subtle text-ink-muted font-bold text-xs hover:border-ink hover:text-ink transition-all disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {users.length > limit && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t-2 border-ink bg-canvas">
            <span className="text-[10px] font-mono text-ink-muted/50">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-ink-muted/50">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setSkip((s) => Math.max(0, s - limit))}
                disabled={!hasPrev}
                className="w-6 h-6 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[10px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
              >
                ←
              </button>
              <button
                onClick={() => setSkip((s) => s + limit)}
                disabled={!hasNext}
                className="w-6 h-6 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[10px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          MODAL OVERLAY (Create / Edit)
          ════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Modal panel */}
          <div className="relative w-full max-w-lg bg-surface border-2 border-ink shadow-hard animate-scale-in">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-ink bg-gradient-to-r from-purple-start/30 to-blue-start/30">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-pulse border border-ink" />
                <span className="text-sm font-black tracking-tight text-ink">
                  {modal === "create" ? "Create User" : "Edit User"}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* First name */}
              <div>
                <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Ada"
                  required
                  className="w-full h-11 px-3.5 bg-canvas border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all"
                />
              </div>

              {/* Last name */}
              <div>
                <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Lovelace"
                  required
                  className="w-full h-11 px-3.5 bg-canvas border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                  disabled={modal === "edit"}
                  className="w-full h-11 px-3.5 bg-canvas border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all disabled:opacity-40"
                />
              </div>

              {/* Password (create only) */}
              {modal === "create" && (
                <div>
                  <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    required
                    className="w-full h-11 px-3.5 bg-canvas border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all"
                  />
                </div>
              )}

              {/* Role (edit only) */}
              {modal === "edit" && (
                <div>
                  <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                    Role
                  </label>
                  <div className="flex gap-2">
                    {["user", "admin"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: r }))}
                        className={`flex-1 h-11 rounded-[4px] border-2 font-bold text-xs font-mono uppercase tracking-wider transition-all ${
                          form.role === r
                            ? "bg-gradient-to-br from-purple-start to-purple-end text-ink border-ink shadow-hard"
                            : "bg-canvas text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active status (edit only) */}
              {modal === "edit" && (
                <div>
                  <label className="block text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                    Account Status
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_active: true }))}
                      className={`flex-1 h-11 rounded-[4px] border-2 font-bold text-xs font-mono uppercase tracking-wider transition-all ${
                        form.is_active === true
                          ? "bg-gradient-to-br from-green-start to-green-end text-ink border-ink shadow-hard"
                          : "bg-canvas text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_active: false }))}
                      className={`flex-1 h-11 rounded-[4px] border-2 font-bold text-xs font-mono uppercase tracking-wider transition-all ${
                        form.is_active === false
                          ? "bg-card-hover text-red-500 border-red-400"
                          : "bg-canvas text-ink-muted border-border-subtle hover:border-ink hover:text-ink"
                      }`}
                    >
                      Inactive
                    </button>
                  </div>
                </div>
              )}

              {/* Form error */}
              {formError && (
                <div className="rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
                  <p className="text-xs font-mono font-bold text-red-600">{formError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="h-11 px-5 rounded-[4px] border-2 border-border-subtle text-xs font-mono font-bold text-ink-muted hover:border-ink hover:text-ink transition-all disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : modal === "create" ? (
                    "Create User"
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          AUDIT LOG
          ════════════════════════════════════════ */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-accent animate-pulse border border-ink shrink-0" />
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
              Audit Log
            </span>
          </div>
          <button
            onClick={fetchAuditLog}
            disabled={auditLogLoading}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[4px] border-2 border-border-subtle text-[10px] font-mono font-bold text-ink-muted hover:border-ink hover:text-ink hover:bg-card-hover active:translate-x-[1px] active:translate-y-[1px] transition-all disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`${auditLogLoading ? "animate-spin" : ""}`}>
              <path d="M10 6A4 4 0 114 2a4 4 0 014-4v2a2 2 0 100 4v4zM8 8l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>

        <div className="rounded-[4px] bg-surface border-2 border-ink shadow-hard overflow-hidden">
          {/* ── Desktop header ── */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-gradient-to-r from-blue-start/30 to-green-start/30 border-b-2 border-ink text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
            <div className="col-span-2">Action</div>
            <div className="col-span-2">Resource</div>
            <div className="col-span-3">Details</div>
            <div className="col-span-2">User ID</div>
            <div className="col-span-3">Timestamp</div>
          </div>

          {/* ── Loading ── */}
          {auditLogLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
                <span className="text-xs font-mono font-bold text-ink-muted ml-1">Loading audit log…</span>
              </div>
            </div>
          ) : auditLogError ? (
            <div className="p-4">
              <div className="rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
                <p className="text-xs font-mono font-bold text-red-600">{auditLogError}</p>
              </div>
            </div>
          ) : auditLog.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-mono text-ink-muted/60">No audit log entries yet.</p>
            </div>
          ) : (
            <div>
              {auditLog.map((entry, i) => (
                <AuditLogRow key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          )}

          {/* ── Footer count ── */}
          {auditLog.length > 0 && !auditLogLoading && (
            <div className="flex items-center justify-between px-5 py-2.5 border-t-2 border-ink bg-canvas">
              <span className="text-[10px] font-mono text-ink-muted/50">
                {auditLog.length} entr{auditLog.length !== 1 ? "ies" : "y"}
              </span>
              <span className="text-[10px] font-mono text-ink-muted/40">
                Most recent first
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer note ── */}
      <div className="mt-6 pt-4 border-t border-border-subtle flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-accent border border-ink" />
        <span className="text-[10px] font-mono text-ink-muted/50">
          Admin actions are logged to the audit trail.
        </span>
      </div>
    </div>
  );
}
