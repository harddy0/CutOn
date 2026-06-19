"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listStudySessions,
  createStudySession,
  getStudySession,
  deleteStudySession,
  chatSend,
  confirmJournal,
  ApiError,
} from "@/lib/api";
import type {
  StudySessionResponse,
  StudyMessageResponse,
  ChatResponse,
  JournalSuggestion,
  QuizSuggestion,
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StudyPage() {
  // ── Sessions ──
  const [sessions, setSessions] = useState<StudySessionResponse[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // ── Session pagination (client-side) ──
  const [sessionSkip, setSessionSkip] = useState(0);
  const sessionLimit = 10;
  const sessionTotal = sessions.length;
  const sessionTotalPages = Math.max(1, Math.ceil(sessionTotal / sessionLimit));
  const sessionCurrentPage = Math.floor(sessionSkip / sessionLimit) + 1;
  const sessionHasPrev = sessionSkip > 0;
  const sessionHasNext = sessionSkip + sessionLimit < sessionTotal;
  const paginatedSessions = sessions.slice(sessionSkip, sessionSkip + sessionLimit);

  // ── Active session ──
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StudyMessageResponse[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  // ── Mobile sessions panel ──
  const [showMobileSessions, setShowMobileSessions] = useState(false);

  // ── Chat input ──
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Suggestions ──
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    journal?: JournalSuggestion & { sessionId: string };
    quiz?: QuizSuggestion;
  } | null>(null);
  const [confirmingJournal, setConfirmingJournal] = useState(false);
  const [journalConfirmed, setJournalConfirmed] = useState(false);

  // ── Scroll ref ──
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Fetch sessions
  // ------------------------------------------------------------------

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const data = await listStudySessions();
      setSessions(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Reset session pagination when sessions list changes (e.g. after create/delete)
  useEffect(() => {
    setSessionSkip(0);
  }, [sessions.length]);

  // ------------------------------------------------------------------
  // Load session messages
  // ------------------------------------------------------------------

  const loadSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    setError(null);
    setPendingSuggestion(null);
    try {
      const data = await getStudySession(sessionId);
      setMessages(data.messages);
      setSessionTitle(data.title);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Create session
  // ------------------------------------------------------------------

  const handleCreateSession = useCallback(async () => {
    setError(null);
    try {
      const session = await createStudySession({ title: "New Study Session" });
      setSessions((prev) => [session, ...prev]);
      setSessionSkip(0);
      await loadSession(session.id);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [loadSession]);

  // ------------------------------------------------------------------
  // Delete session
  // ------------------------------------------------------------------

  const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      await deleteStudySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
        setSessionTitle("");
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [activeSessionId]);

  // ------------------------------------------------------------------
  // Send chat message
  // ------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeSessionId) return;

    setInput("");
    setSending(true);
    setError(null);
    setPendingSuggestion(null);

    // Optimistically add user message
    const tempUserMsg: StudyMessageResponse = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res: ChatResponse = await chatSend(activeSessionId, { message: text });

      // Add assistant reply
      const assistantMsg: StudyMessageResponse = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        metadata: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Check for suggestions
      if (res.journal_suggestion || res.quiz_suggestion) {
        setPendingSuggestion({
          journal: res.journal_suggestion
            ? { ...res.journal_suggestion, sessionId: activeSessionId }
            : undefined,
          quiz: res.quiz_suggestion ?? undefined,
        });
        setJournalConfirmed(false);
      }

      // Refresh session list to update counts
      const updatedSessions = await listStudySessions();
      setSessions(updatedSessions);

      // Update title if first message (assistant named it)
      if (sessionTitle === "New Study Session") {
        const sessionDetail = await getStudySession(activeSessionId);
        setSessionTitle(sessionDetail.title);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
      // Remove optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  }, [input, activeSessionId, sessionTitle]);

  // ------------------------------------------------------------------
  // Handle Enter to send
  // ------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ------------------------------------------------------------------
  // Auto-scroll to bottom on new messages
  // ------------------------------------------------------------------

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Study Buddy</h1>
          <p className="text-sm font-mono text-ink-muted">
            Conversations with your AI tutor, powered by your own materials.
          </p>
        </div>
        <button
          onClick={handleCreateSession}
          disabled={loadingSessions}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          New Session
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-3 shrink-0 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* ════════════════════════════════════════
            MOBILE SESSION OVERLAY
            ════════════════════════════════════════ */}
        {showMobileSessions && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink/20" onClick={() => setShowMobileSessions(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-surface border-r-2 border-ink shadow-hard overflow-hidden flex flex-col animate-fade-up">
              <div className="px-3 py-2.5 border-b-2 border-ink bg-gradient-to-r from-green-start/30 to-blue-start/30 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                  Sessions
                </span>
                <button
                  onClick={() => setShowMobileSessions(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {paginatedSessions.map((session) => {
                  const isActive = activeSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        loadSession(session.id);
                        setShowMobileSessions(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadSession(session.id);
                          setShowMobileSessions(false);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group w-full text-left px-3 py-2.5 transition-colors border-l-2 cursor-pointer ${
                        isActive
                          ? "bg-green-start/30 border-l-green-accent"
                          : "border-l-transparent hover:bg-card-hover hover:border-l-border-subtle"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`text-xs font-bold truncate flex-1 ${isActive ? "text-ink" : "text-ink-muted"}`}>
                          {session.title || "Untitled"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.id, e);
                          }}
                          className="shrink-0 w-4 h-4 flex items-center justify-center rounded-[2px] hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete session"
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-ink-muted/50">{session.message_count} msgs</span>
                        <span className="text-[10px] font-mono text-ink-muted/40">{formatDateShort(session.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* ── Mobile pagination ── */}
              {sessionTotal > sessionLimit && (
                <div className="border-t-2 border-ink px-2 py-1.5 flex items-center justify-between bg-canvas">
                  <span className="text-[9px] font-mono text-ink-muted/50">
                    {sessionTotal} session{sessionTotal !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono text-ink-muted/50 mr-1">
                      {sessionCurrentPage}/{sessionTotalPages}
                    </span>
                    <button
                      onClick={() => setSessionSkip((s) => Math.max(0, s - sessionLimit))}
                      disabled={!sessionHasPrev}
                      className="w-5 h-5 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[9px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => setSessionSkip((s) => s + sessionLimit)}
                      disabled={!sessionHasNext}
                      className="w-5 h-5 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[9px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            SESSION SIDEBAR (desktop)
            ════════════════════════════════════════ */}
        <div className="hidden md:flex flex-col w-56 shrink-0 rounded-[4px] bg-surface border-2 border-ink shadow-hard overflow-hidden">
          <div className="px-3 py-2.5 border-b-2 border-ink bg-gradient-to-r from-green-start/30 to-blue-start/30">
            <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
              Sessions
            </span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {loadingSessions ? (
              <div className="flex items-center gap-2 p-4 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-accent animate-pulse border border-ink" />
                <span className="text-xs font-mono font-bold text-ink-muted">Loading…</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs font-mono text-ink-muted/60">No sessions yet.</p>
              </div>
            ) : (
              <div className="py-1">
                {paginatedSessions.map((session) => {
                  const isActive = activeSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => loadSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadSession(session.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group w-full text-left px-3 py-2.5 transition-colors border-l-2 cursor-pointer ${
                        isActive
                          ? "bg-green-start/30 border-l-green-accent"
                          : "border-l-transparent hover:bg-card-hover hover:border-l-border-subtle"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={`text-xs font-bold truncate flex-1 ${
                            isActive ? "text-ink" : "text-ink-muted"
                          }`}
                        >
                          {session.title || "Untitled"}
                        </span>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="shrink-0 w-4 h-4 flex items-center justify-center rounded-[2px] hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete session"
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-ink-muted/50">
                          {session.message_count} msgs
                        </span>
                        <span className="text-[10px] font-mono text-ink-muted/40">
                          {formatDateShort(session.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── Desktop pagination ── */}
            {sessionTotal > sessionLimit && (
              <div className="border-t-2 border-ink px-2 py-1.5 flex items-center justify-between bg-canvas shrink-0">
                <span className="text-[9px] font-mono text-ink-muted/50">
                  {sessionTotal}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-ink-muted/50 mr-1">
                    {sessionCurrentPage}/{sessionTotalPages}
                  </span>
                  <button
                    onClick={() => setSessionSkip((s) => Math.max(0, s - sessionLimit))}
                    disabled={!sessionHasPrev}
                    className="w-5 h-5 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[9px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setSessionSkip((s) => s + sessionLimit)}
                    disabled={!sessionHasNext}
                    className="w-5 h-5 flex items-center justify-center rounded-[2px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all text-[9px] font-mono font-bold disabled:opacity-30 disabled:pointer-events-none"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════
            CHAT AREA
            ════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 rounded-[4px] bg-surface border-2 border-ink shadow-hard overflow-hidden">
          {!activeSessionId ? (
            /* ── Empty state (no session selected) ── */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end mb-5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M2 17l10 5 10-5" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M2 12l10 5 10-5" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="text-lg font-black tracking-tight text-ink mb-1">Start a Conversation</h2>
                <p className="text-sm font-mono text-ink-muted/70 mb-5">
                  Select a session from the sidebar or create a new one to begin chatting with your AI Study Buddy.
                </p>
                {/* Mobile: show sessions inline */}
                <div className="md:hidden space-y-2">
                  {loadingSessions ? (
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-accent animate-pulse border border-ink" />
                      <span className="text-xs font-mono font-bold text-ink-muted">Loading sessions…</span>
                    </div>
                  ) : sessions.length === 0 ? (
                    <p className="text-xs font-mono text-ink-muted/60">No sessions yet. Create one above.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {paginatedSessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => loadSession(session.id)}
                          className="w-full text-left px-3 py-2 rounded-[4px] border-2 border-border-subtle hover:border-ink hover:bg-card-hover transition-all"
                        >
                          <span className="text-sm font-bold text-ink">{session.title || "Untitled"}</span>
                          <span className="text-xs font-mono text-ink-muted/50 ml-2">{session.message_count} msgs</span>
                        </button>
                      ))}
                      {sessionTotal > sessionLimit && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            onClick={() => setSessionSkip((s) => Math.max(0, s - sessionLimit))}
                            disabled={!sessionHasPrev}
                            className="h-6 px-2 rounded-[2px] border border-border-subtle text-[9px] font-mono font-bold hover:border-ink hover:bg-card-hover transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            ← Prev
                          </button>
                          <span className="text-[9px] font-mono text-ink-muted/50">
                            {sessionCurrentPage}/{sessionTotalPages}
                          </span>
                          <button
                            onClick={() => setSessionSkip((s) => s + sessionLimit)}
                            disabled={!sessionHasNext}
                            className="h-6 px-2 rounded-[2px] border border-border-subtle text-[9px] font-mono font-bold hover:border-ink hover:bg-card-hover transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            Next →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Chat header with session title ── */}
              <div className="px-5 py-3 border-b-2 border-ink bg-gradient-to-r from-green-start/20 to-blue-start/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Mobile: back to sessions */}
                  <button
                    onClick={() => setShowMobileSessions(true)}
                    className="md:hidden w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-ink hover:bg-card-hover transition-all shrink-0"
                    title="Switch session"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink shrink-0" />
                  <span className="text-sm font-bold text-ink truncate">{sessionTitle || "Study Session"}</span>
                </div>
                <span className="text-[10px] font-mono text-ink-muted/50 shrink-0">
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* ── Messages ── */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
                {loadingMessages ? (
                  <div className="flex items-center gap-2 py-12 justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
                    <span className="text-sm font-mono font-bold text-ink-muted">Loading messages…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm font-mono text-ink-muted/60 text-center">
                      Send a message to start the conversation.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] rounded-[4px] border-2 border-ink p-3.5 ${
                          msg.role === "user"
                            ? "bg-gradient-to-br from-blue-start to-blue-end"
                            : "bg-gradient-to-br from-green-start to-green-end"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                              msg.role === "user" ? "text-blue-accent" : "text-green-accent"
                            }`}
                          >
                            {msg.role === "user" ? "You" : "Study Buddy"}
                          </span>
                          <span className="text-[9px] font-mono text-ink-muted/40">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                        <p
                          className="text-sm font-medium text-ink/85 leading-relaxed whitespace-pre-wrap"
                          style={{ wordBreak: "break-word" }}
                        >
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                {/* ── Suggestions ── */}
                {pendingSuggestion && (pendingSuggestion.journal || pendingSuggestion.quiz) && (
                  <div className="space-y-2">
                    {pendingSuggestion.journal && (
                      <div className="rounded-[4px] border-2 border-purple-accent/40 bg-gradient-to-br from-purple-start to-purple-end p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 2h8v8H2z" stroke="#A07CB8" strokeWidth="1.2" strokeLinejoin="round" />
                              <path d="M4 4h4M4 6h4M4 8h2" stroke="#A07CB8" strokeWidth="1" strokeLinecap="round" />
                            </svg>
                            <span className="text-[10px] font-mono font-bold text-purple-accent uppercase tracking-wider">
                              Journal suggestion
                            </span>
                          </div>
                          <button
                            onClick={() => setPendingSuggestion((prev) => prev ? { ...prev, journal: undefined } : null)}
                            className="w-5 h-5 flex items-center justify-center rounded-[2px] hover:bg-purple-accent/20 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1l6 6M7 1l-6 6" stroke="#A07CB8" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-xs font-medium text-ink/70 leading-relaxed mb-3">
                          {pendingSuggestion.journal.content}
                        </p>
                        <div className="flex gap-2">
                          {journalConfirmed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-green-accent">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                                <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Added to journal
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={async () => {
                                  setConfirmingJournal(true);
                                  try {
                                    await confirmJournal(
                                      pendingSuggestion.journal!.sessionId,
                                      pendingSuggestion.journal!.message_id
                                    );
                                    setJournalConfirmed(true);
                                  } catch (err: unknown) {
                                    setError(extractErrorMessage(err));
                                  } finally {
                                    setConfirmingJournal(false);
                                  }
                                }}
                                disabled={confirmingJournal}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-purple-accent bg-white text-[10px] font-mono font-bold text-purple-accent hover:bg-purple-start transition-all disabled:opacity-40"
                              >
                                {confirmingJournal ? "Adding…" : (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Add to Journal
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setPendingSuggestion((prev) => prev ? { ...prev, journal: undefined } : null)}
                                className="px-2.5 py-1 rounded-[4px] border border-border-subtle text-[10px] font-mono font-bold text-ink-muted hover:border-ink hover:text-ink transition-all"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {pendingSuggestion.quiz && (
                      <div className="rounded-[4px] border-2 border-blue-accent/40 bg-gradient-to-br from-blue-start to-blue-end p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="4.5" stroke="#6B9FD4" strokeWidth="1.2" />
                              <path d="M4.5 6l1 1 2-2" stroke="#6B9FD4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
                              Quiz suggestion
                            </span>
                          </div>
                          <button
                            onClick={() => setPendingSuggestion((prev) => prev ? { ...prev, quiz: undefined } : null)}
                            className="w-5 h-5 flex items-center justify-center rounded-[2px] hover:bg-blue-accent/20 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1l6 6M7 1l-6 6" stroke="#6B9FD4" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-xs font-medium text-ink/70 leading-relaxed">
                          Try a quiz on <strong>{pendingSuggestion.quiz.topic}</strong> — {pendingSuggestion.quiz.reason}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Typing indicator ── */}
                {sending && (
                  <div className="flex justify-start">
                    <div className="rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-green-accent uppercase tracking-wider mr-1">
                          Study Buddy
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* ── Input ── */}
              <div className="shrink-0 border-t-2 border-ink p-3 bg-canvas">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask your Study Buddy anything…"
                    rows={1}
                    disabled={sending}
                    className="flex-1 min-h-[44px] max-h-[120px] px-3.5 py-2.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all resize-none disabled:opacity-40"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim() || !activeSessionId}
                    className="shrink-0 h-[44px] w-[44px] flex items-center justify-center rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
                    title="Send message"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8l12-6-6 12-2-4-4-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M6 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
