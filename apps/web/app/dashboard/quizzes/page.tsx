"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listTopics,
  listQuizzes,
  generateQuiz,
  getQuiz,
  deleteQuiz,
  submitAttempt,
  listAttempts,
  ApiError,
} from "@/lib/api";
import type {
  TopicResponse,
  QuizSummaryResponse,
  QuizResponse,
  QuizAttemptResponse,
  QuizQuestionResponse,
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Question component
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  index,
  total,
  selectedOptionId,
  onSelect,
  showResult,
  correctOptionId,
}: {
  question: QuizQuestionResponse;
  index: number;
  total: number;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  showResult?: boolean;
  correctOptionId?: string | null;
}) {
  const isCorrect = showResult && selectedOptionId === correctOptionId;
  const isWrong = showResult && selectedOptionId !== correctOptionId && selectedOptionId !== null;

  return (
    <div className="animate-fade-up">
      {/* Question header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end text-xs font-black text-blue-accent">
          {index + 1}
        </span>
        <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
          {question.source_type === "document_chunk" ? "From documents" : "From journal"}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-ink-muted/40">
          {index + 1} of {total}
        </span>
      </div>

      {/* Question text */}
      <p className="text-base md:text-lg font-bold text-ink leading-relaxed mb-5">
        {question.question}
      </p>

      {/* Options */}
      <div className="space-y-2.5">
        {question.options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          let borderCls = "border-ink hover:border-ink hover:bg-card-hover";
          let bgCls = "bg-surface";
          let indicatorCls = "border-2 border-ink";
          let innerCls = "";
          let labelCls = "text-ink font-medium";

          if (showResult) {
            if (option.id === correctOptionId) {
              borderCls = "border-green-accent";
              bgCls = "bg-gradient-to-r from-green-start to-green-end";
              indicatorCls = "border-2 border-green-accent bg-green-accent";
              innerCls = "bg-green-accent";
              labelCls = "text-ink font-bold";
            } else if (isSelected && option.id !== correctOptionId) {
              borderCls = "border-red-400";
              bgCls = "bg-red-50";
              indicatorCls = "border-2 border-red-400 bg-red-100";
              innerCls = "bg-red-400";
              labelCls = "text-red-600 font-bold";
            } else {
              borderCls = "border-border-subtle opacity-50";
              bgCls = "bg-surface";
              indicatorCls = "border-2 border-border-subtle";
              labelCls = "text-ink-muted/50";
            }
          } else if (isSelected) {
            borderCls = "border-blue-accent bg-gradient-to-r from-blue-start to-blue-end";
            indicatorCls = "border-2 border-blue-accent bg-blue-accent";
            innerCls = "bg-white";
            labelCls = "text-ink font-bold";
          }

          return (
            <button
              key={option.id}
              onClick={() => !showResult && onSelect(option.id)}
              disabled={showResult}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[4px] border-2 transition-all duration-150 ${
                borderCls
              } ${bgCls} ${
                showResult ? "cursor-default" : "cursor-pointer hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover shadow-soft"
              }`}
            >
              {/* Radio indicator */}
              <span
                className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 ${indicatorCls}`}
              >
                {innerCls && (
                  <span className={`w-2.5 h-2.5 rounded-full ${innerCls} transition-all duration-150`} />
                )}
              </span>

              <span className={`text-sm text-left leading-snug ${labelCls}`}>
                {option.text}
              </span>

              {/* Correct/Wrong icons */}
              {showResult && option.id === correctOptionId && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 ml-auto">
                  <circle cx="8" cy="8" r="7" fill="#3BCB8A" stroke="#1A1A1A" strokeWidth="1.5" />
                  <path d="M5 8.5l2 2 4-4.5" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {showResult && isSelected && option.id !== correctOptionId && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 ml-auto">
                  <circle cx="8" cy="8" r="7" fill="#f87171" stroke="#1A1A1A" strokeWidth="1.5" />
                  <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="w-full h-2 bg-canvas border-2 border-ink rounded-[4px] overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-accent to-purple-accent transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

function ScoreRing({ score, maxScore, passed }: { score: number; maxScore: number; passed: boolean }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        {/* Background ring */}
        <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0">
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke="#D4E2DE"
            strokeWidth="6"
          />
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke={passed ? "#3BCB8A" : "#f87171"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 48 48)"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black tracking-tight">{pct}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {passed ? (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" fill="#3BCB8A" stroke="#1A1A1A" strokeWidth="1.5" />
              <path d="M4.5 7.5l1.5 1.5 3.5-4" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-black text-green-accent">Passed</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" fill="#f87171" stroke="#1A1A1A" strokeWidth="1.5" />
              <path d="M5 5l4 4M9 5l-4 4" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-black text-red-500">Needs Review</span>
          </>
        )}
      </div>
      <span className="text-[11px] font-mono text-ink-muted/60">
        {score} / {maxScore} correct
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past Attempts list component (used in results view)
// ---------------------------------------------------------------------------

function AttemptHistoryList({
  quizId,
  currentAttemptId,
  onViewAttempt,
}: {
  quizId: string;
  currentAttemptId: string;
  onViewAttempt: (quizId: string, attempt: QuizAttemptResponse) => void;
}) {
  const [attempts, setAttempts] = useState<QuizAttemptResponse[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listAttempts(quizId);
        if (!cancelled) setAttempts(data);
      } catch {
        // silently fail — this is supplementary content
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [quizId]);

  if (loading) {
    return (
      <div className="mt-6 pt-4 border-t-2 border-border-subtle">
        <div className="flex items-center gap-2 py-4 justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-accent animate-pulse border border-ink" />
          <span className="text-xs font-mono font-bold text-ink-muted">Loading past attempts…</span>
        </div>
      </div>
    );
  }

  const pastAttempts = (attempts ?? []).filter((a) => a.id !== currentAttemptId);
  if (pastAttempts.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t-2 border-border-subtle">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-blue-accent animate-pulse border border-ink" />
        <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
          Past Attempts ({pastAttempts.length})
        </span>
      </div>

      <div className="space-y-2">
        {pastAttempts.map((att) => {
          const pct = att.max_score > 0 ? Math.round((att.score / att.max_score) * 100) : 0;
          return (
            <div
              key={att.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-[4px] border-2 border-border-subtle bg-canvas hover:border-ink hover:bg-card-hover transition-all cursor-pointer"
              onClick={() => onViewAttempt(quizId, att)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onViewAttempt(quizId, att); } }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end text-[10px] font-black text-blue-accent">
                  {pct}%
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">
                      {att.score} / {att.max_score}
                    </span>
                    {att.passed ? (
                      <span className="text-[9px] font-mono font-bold text-green-accent">Passed</span>
                    ) : (
                      <span className="text-[9px] font-mono font-bold text-red-500">Failed</span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted/50">{formatDateTime(att.completed_at)}</span>
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-ink-muted shrink-0">
                <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View states
// ---------------------------------------------------------------------------

type ViewState =
  | { type: "list" }
  | { type: "taking"; quiz: QuizResponse; currentQuestion: number; answers: Map<string, string> }
  | { type: "result"; attempt: QuizAttemptResponse; quiz: QuizResponse }
  | { type: "history"; quizId: string; quizTitle: string; attempts: QuizAttemptResponse[] }
  | { type: "viewing_history_attempt"; quiz: QuizResponse; attempt: QuizAttemptResponse }
  | { type: "generating" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuizzesPage() {
  // ── Data ──
  const [quizzes, setQuizzes] = useState<QuizSummaryResponse[]>([]);
  const [topics, setTopics] = useState<TopicResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── View state ──
  const [view, setView] = useState<ViewState>({ type: "list" });

  // ── Generate panel ──
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateMode, setGenerateMode] = useState<"blind_spot" | "topic_review">("blind_spot");
  const [generateTopicId, setGenerateTopicId] = useState("");
  const [generateQuery, setGenerateQuery] = useState("");
  const [generateNumQuestions, setGenerateNumQuestions] = useState(10);
  const [generating, setGenerating] = useState(false);

  // ── Delete ──
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── History loading ──
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Scroll anchor ──
  const quizContainerRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quizData, topicData] = await Promise.all([
        listQuizzes(),
        listTopics(),
      ]);
      setQuizzes(quizData);
      setTopics(topicData.items);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Generate quiz
  // ------------------------------------------------------------------

  const handleGenerate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generateTopicId && !generateQuery.trim()) return;

    setGenerating(true);
    setError(null);
    try {
      const quiz = await generateQuiz({
        topic_id: generateTopicId || null,
        query: generateQuery.trim() || null,
        num_questions: generateNumQuestions,
        mode: generateMode,
      });
      setShowGenerate(false);
      setGenerateTopicId("");
      setGenerateQuery("");
      setGenerateNumQuestions(10);
      setView({ type: "taking", quiz, currentQuestion: 0, answers: new Map() });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }, [generateTopicId, generateQuery, generateNumQuestions, generateMode]);

  // ------------------------------------------------------------------
  // Take quiz
  // ------------------------------------------------------------------

  const handleSelectAnswer = useCallback((optionId: string) => {
    setView((prev) => {
      if (prev.type !== "taking") return prev;
      const answers = new Map(prev.answers);
      const question = prev.quiz.questions[prev.currentQuestion];
      if (question) answers.set(question.id, optionId);
      return { ...prev, answers };
    });
  }, []);

  const handleNextQuestion = useCallback(() => {
    setView((prev) => {
      if (prev.type !== "taking") return prev;
      if (prev.currentQuestion < prev.quiz.questions.length - 1) {
        return { ...prev, currentQuestion: prev.currentQuestion + 1 };
      }
      return prev;
    });
  }, []);

  const handlePrevQuestion = useCallback(() => {
    setView((prev) => {
      if (prev.type !== "taking") return prev;
      if (prev.currentQuestion > 0) {
        return { ...prev, currentQuestion: prev.currentQuestion - 1 };
      }
      return prev;
    });
  }, []);

  const handleSubmitQuiz = useCallback(async () => {
    if (view.type !== "taking") return;

    const answers = view.quiz.questions.map((q) => ({
      question_id: q.id,
      selected_option_id: view.answers.get(q.id) ?? "",
    }));

    // Check all questions answered
    if (answers.some((a) => !a.selected_option_id)) {
      setError("Please answer all questions before submitting.");
      return;
    }

    setError(null);
    try {
      const attempt = await submitAttempt(view.quiz.id, { answers });
      setView({ type: "result", attempt, quiz: view.quiz });
      // Refresh quiz list to update summary
      fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [view, fetchData]);

  // ------------------------------------------------------------------
  // Start quiz from list
  // ------------------------------------------------------------------

  const handleStartQuiz = useCallback(async (quizId: string) => {
    setLoading(true);
    setError(null);
    try {
      const quiz = await getQuiz(quizId);
      setView({ type: "taking", quiz, currentQuestion: 0, answers: new Map() });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = useCallback(async (quizId: string) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteQuiz(quizId);
      setDeletingId(null);
      await fetchData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [fetchData]);

  // ------------------------------------------------------------------
  // View history
  // ------------------------------------------------------------------

  const handleViewHistory = useCallback(async (quizId: string, quizTitle: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const attempts = await listAttempts(quizId);
      setView({ type: "history", quizId, quizTitle, attempts });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleViewAttempt = useCallback(async (quizId: string, attempt: QuizAttemptResponse) => {
    setLoading(true);
    setError(null);
    try {
      const quiz = await getQuiz(quizId);
      setView({ type: "viewing_history_attempt", quiz, attempt });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Returns to list
  // ------------------------------------------------------------------

  const handleBackToList = useCallback(() => {
    setView({ type: "list" });
    setError(null);
  }, []);

  // ------------------------------------------------------------------
  // Topic name lookup
  // ------------------------------------------------------------------

  const getTopicName = useCallback(
    (topicId: string) => topics.find((t) => t.id === topicId)?.name ?? "Unknown",
    [topics]
  );

  // ------------------------------------------------------------------
  // Render: Taking Quiz
  // ------------------------------------------------------------------

  if (view.type === "taking") {
    const { quiz, currentQuestion: qIndex, answers } = view;
    const totalQuestions = quiz.questions.length;
    const answeredCount = answers.size;
    const allAnswered = answeredCount === totalQuestions;
    const question = quiz.questions[qIndex];

    return (
      <div ref={quizContainerRef}>
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToList}
              className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover transition-all"
              title="Back to quizzes"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-black tracking-tight text-ink">{quiz.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink bg-gradient-to-r from-blue-start to-blue-end text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
                  {getTopicName(quiz.topic_id)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink text-[10px] font-mono font-bold uppercase tracking-wider ${
                  quiz.mode === "blind_spot"
                    ? "bg-gradient-to-r from-purple-start to-purple-end text-purple-accent"
                    : "bg-gradient-to-r from-green-start to-green-end text-green-accent"
                }`}>
                  {quiz.mode === "blind_spot" ? "Blind Spot" : "Topic Review"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
            <p className="text-xs font-mono font-bold text-red-600">{error}</p>
          </div>
        )}

        {/* ── Progress bar + stats ── */}
        <div className="mb-6 bg-surface border-2 border-ink rounded-[4px] p-4 shadow-hard">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
              Progress
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-ink-muted/60">
                <span className="text-green-accent font-bold">{answeredCount}</span> / {totalQuestions} answered
              </span>
              <span className="text-ink-muted/40">
                Question {qIndex + 1} of {totalQuestions}
              </span>
            </div>
          </div>
          <ProgressBar current={qIndex + 1} total={totalQuestions} />

          {/* Question navigator chips */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {quiz.questions.map((q, i) => {
              const isAnswered = answers.has(q.id);
              const isActive = i === qIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setView((prev) => {
                    if (prev.type !== "taking") return prev;
                    return { ...prev, currentQuestion: i };
                  })}
                  className={`w-7 h-7 rounded-[4px] border-2 text-[11px] font-mono font-bold transition-all ${
                    isActive
                      ? "bg-ink text-white border-ink"
                      : isAnswered
                      ? "bg-gradient-to-r from-green-start to-green-end text-green-accent border-ink"
                      : "bg-surface text-ink-muted border-border-subtle hover:border-ink"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Current question card ── */}
        {question && (
          <div className="mb-6 bg-surface border-2 border-ink rounded-[4px] p-5 md:p-6 shadow-hard">
            <QuestionCard
              question={question}
              index={qIndex}
              total={totalQuestions}
              selectedOptionId={answers.get(question.id) ?? null}
              onSelect={handleSelectAnswer}
            />
          </div>
        )}

        {/* ── Navigation buttons ── */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePrevQuestion}
            disabled={qIndex === 0}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[4px] border-2 border-ink text-sm font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7 3L4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Previous
          </button>

          {qIndex < totalQuestions - 1 ? (
            <button
              onClick={handleNextQuestion}
              disabled={!answers.has(question?.id ?? "")}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[4px] border-2 border-ink bg-ink text-white text-sm font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              Next
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmitQuiz}
              disabled={!allAnswered}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[4px] border-2 border-ink bg-gradient-to-br from-green-start to-green-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 7.5l1.5 1.5L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Submit Quiz
            </button>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: Results
  // ------------------------------------------------------------------

  if (view.type === "result") {
    const { attempt, quiz } = view;
    const correctMap = new Map(
      attempt.answers.map((a) => [a.question_id, a])
    );

    return (
      <div>
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToList}
              className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover transition-all"
              title="Back to quizzes"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-black tracking-tight text-ink">{quiz.title} — Results</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink bg-gradient-to-r from-blue-start to-blue-end text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
                  {getTopicName(quiz.topic_id)}
                </span>
                <span className="text-[10px] font-mono text-ink-muted/40">
                  Completed {formatDateTime(attempt.completed_at)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleStartQuiz(quiz.id)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 1.5v9l7-4.5L3 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            Retake
          </button>
        </div>

        {/* ── Score hero ── */}
        <div className="mb-6 bg-surface border-2 border-ink rounded-[4px] p-6 md:p-8 shadow-hard text-center">
          <ScoreRing score={attempt.score} maxScore={attempt.max_score} passed={attempt.passed} />
        </div>

        {/* ── Answer review ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink" />
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
              Answer Review
            </span>
          </div>

          {quiz.questions.map((question, i) => {
            const graded = correctMap.get(question.id);
            const selectedId = graded?.selected_option_id ?? null;
            const correctId = graded?.correct_option_id ?? null;
            const isCorrect = graded?.is_correct ?? false;

            return (
              <div
                key={question.id}
                className="bg-surface border-2 border-ink rounded-[4px] p-4 md:p-5 shadow-hard"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-[2px] text-xs font-black ${
                    isCorrect
                      ? "bg-gradient-to-r from-green-start to-green-end text-green-accent"
                      : "bg-red-50 text-red-500"
                  }`}>
                    {isCorrect ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 6.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-ink-muted">
                    Question {i + 1}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted/40 ml-auto">
                    {question.source_type === "document_chunk" ? "From documents" : "From journal"}
                  </span>
                </div>

                <p className="text-sm font-bold text-ink mb-3 leading-relaxed">
                  {question.question}
                </p>

                <div className="space-y-1.5">
                  {question.options.map((opt) => {
                    let cls = "border-border-subtle text-ink-muted/60";
                    if (opt.id === correctId) {
                      cls = "border-green-accent bg-gradient-to-r from-green-start to-green-end text-ink font-bold";
                    } else if (opt.id === selectedId && opt.id !== correctId) {
                      cls = "border-red-400 bg-red-50 text-red-600 font-bold";
                    }
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-[4px] border-2 text-sm ${cls}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current opacity-60" />
                        {opt.text}
                        {opt.id === correctId && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 ml-auto">
                            <circle cx="6" cy="6" r="5" fill="#3BCB8A" stroke="#1A1A1A" strokeWidth="1" />
                            <path d="M4 6.5l1.5 1.5L8 5" stroke="#1A1A1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Past attempts timeline ── */}
        <AttemptHistoryList
          quizId={quiz.id}
          currentAttemptId={attempt.id}
          onViewAttempt={handleViewAttempt}
        />

        {/* ── Back to list ── */}
        <div className="mt-6 text-center">
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[4px] border-2 border-ink text-sm font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7 3L4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: History (list of past attempts)
  // ------------------------------------------------------------------

  if (view.type === "history") {
    const { quizId, quizTitle, attempts } = view;

    return (
      <div>
        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleBackToList}
            className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover transition-all"
            title="Back to quizzes"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-black tracking-tight text-ink">{quizTitle} — History</h1>
            <p className="text-xs font-mono text-ink-muted">
              {attempts.length} attempt{attempts.length !== 1 ? "s" : ""} total
            </p>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex items-center gap-2 py-16 justify-center">
            <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink" />
            <span className="text-sm font-mono font-bold text-ink-muted">Loading attempts…</span>
          </div>
        ) : attempts.length === 0 ? (
          <div className="rounded-[4px] bg-surface border-2 border-ink p-10 shadow-hard text-center">
            <p className="text-sm font-mono font-bold text-ink-muted mb-1">No attempts yet</p>
            <p className="text-xs font-mono text-ink-muted/60">Attempts will appear here after you take the quiz.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att, i) => {
              const pct = att.max_score > 0 ? Math.round((att.score / att.max_score) * 100) : 0;
              return (
                <div
                  key={att.id}
                  className="bg-surface border-2 border-ink rounded-[4px] p-4 shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      {/* Attempt number badge */}
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-[4px] border-2 border-ink bg-gradient-to-br from-blue-start to-blue-end text-xs font-black text-blue-accent">
                        #{attempts.length - i}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black tracking-tight">{pct}%</span>
                          {att.passed ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-gradient-to-r from-green-start to-green-end text-[10px] font-mono font-bold text-green-accent border border-ink">
                              Passed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-red-50 text-[10px] font-mono font-bold text-red-500 border border-ink">
                              Needs review
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-ink-muted/60">
                          {att.score} / {att.max_score} correct — {formatDateTime(att.completed_at)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleViewAttempt(quizId, att)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-[4px] border-2 border-ink text-[11px] font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
                    >
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Start quiz CTA ── */}
        <div className="mt-6 text-center">
          <button
            onClick={() => handleStartQuiz(quizId)}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 1.5v9l7-4.5L3 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            Take Quiz Again
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: Viewing a past attempt from history
  // ------------------------------------------------------------------

  if (view.type === "viewing_history_attempt") {
    const { quiz, attempt } = view;
    const correctMap = new Map(
      attempt.answers.map((a) => [a.question_id, a])
    );

    return (
      <div>
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleViewHistory(quiz.id, quiz.title)}
              className="w-8 h-8 flex items-center justify-center rounded-[4px] border-2 border-ink hover:bg-card-hover transition-all"
              title="Back to history"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-black tracking-tight text-ink">{quiz.title} — Past Result</h1>
              <span className="text-[10px] font-mono text-ink-muted/40">Completed {formatDateTime(attempt.completed_at)}</span>
            </div>
          </div>
        </div>

        {/* ── Score hero ── */}
        <div className="mb-6 bg-surface border-2 border-ink rounded-[4px] p-6 md:p-8 shadow-hard text-center">
          <ScoreRing score={attempt.score} maxScore={attempt.max_score} passed={attempt.passed} />
        </div>

        {/* ── Answer review ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink" />
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">Answer Review</span>
          </div>

          {quiz.questions.map((question, i) => {
            const graded = correctMap.get(question.id);
            const selectedId = graded?.selected_option_id ?? null;
            const correctId = graded?.correct_option_id ?? null;
            const isCorrect = graded?.is_correct ?? false;

            return (
              <div key={question.id} className="bg-surface border-2 border-ink rounded-[4px] p-4 md:p-5 shadow-hard">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-[2px] text-xs font-black ${
                    isCorrect
                      ? "bg-gradient-to-r from-green-start to-green-end text-green-accent"
                      : "bg-red-50 text-red-500"
                  }`}>
                    {isCorrect ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 6.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-ink-muted">Question {i + 1}</span>
                  <span className="text-[10px] font-mono text-ink-muted/40 ml-auto">
                    {question.source_type === "document_chunk" ? "From documents" : "From journal"}
                  </span>
                </div>

                <p className="text-sm font-bold text-ink mb-3 leading-relaxed">{question.question}</p>

                <div className="space-y-1.5">
                  {question.options.map((opt) => {
                    let cls = "border-border-subtle text-ink-muted/60";
                    if (opt.id === correctId) {
                      cls = "border-green-accent bg-gradient-to-r from-green-start to-green-end text-ink font-bold";
                    } else if (opt.id === selectedId && opt.id !== correctId) {
                      cls = "border-red-400 bg-red-50 text-red-600 font-bold";
                    }
                    return (
                      <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-[4px] border-2 text-sm ${cls}`}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current opacity-60" />
                        {opt.text}
                        {opt.id === correctId && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 ml-auto">
                            <circle cx="6" cy="6" r="5" fill="#3BCB8A" stroke="#1A1A1A" strokeWidth="1" />
                            <path d="M4 6.5l1.5 1.5L8 5" stroke="#1A1A1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Back to history ── */}
        <div className="mt-6 text-center">
          <button
            onClick={() => handleViewHistory(quiz.id, quiz.title)}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[4px] border-2 border-ink text-sm font-mono font-bold shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7 3L4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to History
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: List (default)
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Quizzes</h1>
          <p className="text-sm font-mono text-ink-muted">
            Blind-spot and topic review quizzes generated from your materials.
          </p>
        </div>
        <button
          onClick={() => setShowGenerate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {showGenerate ? "Cancel" : "Generate Quiz"}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
          <p className="text-xs font-mono font-bold text-red-600">{error}</p>
        </div>
      )}

      {/* ── Generate panel ── */}
      {showGenerate && (
        <form
          onSubmit={handleGenerate}
          className="mb-6 rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard"
        >
          {/* Mode toggle */}
          <div className="mb-4">
            <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-2">
              Quiz Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGenerateMode("blind_spot")}
                className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-[4px] border-2 transition-all ${
                  generateMode === "blind_spot"
                    ? "bg-gradient-to-r from-purple-start to-purple-end border-ink shadow-hard"
                    : "bg-surface border-border-subtle hover:border-ink"
                }`}
              >
                <span className={`text-sm font-black ${
                  generateMode === "blind_spot" ? "text-purple-accent" : "text-ink-muted"
                }`}>
                  Blind Spot
                </span>
                <span className="text-[10px] font-mono text-center leading-tight text-ink-muted/70">
                  Find knowledge gaps using vector delta analysis
                </span>
              </button>
              <button
                type="button"
                onClick={() => setGenerateMode("topic_review")}
                className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-[4px] border-2 transition-all ${
                  generateMode === "topic_review"
                    ? "bg-gradient-to-r from-green-start to-green-end border-ink shadow-hard"
                    : "bg-surface border-border-subtle hover:border-ink"
                }`}
              >
                <span className={`text-sm font-black ${
                  generateMode === "topic_review" ? "text-green-accent" : "text-ink-muted"
                }`}>
                  Topic Review
                </span>
                <span className="text-[10px] font-mono text-center leading-tight text-ink-muted/70">
                  General comprehension quiz from your materials
                </span>
              </button>
            </div>
          </div>

          {/* Topic or Query */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Topic (optional)
              </label>
              <div className="relative">
                <select
                  value={generateTopicId}
                  onChange={(e) => {
                    setGenerateTopicId(e.target.value);
                    if (e.target.value) setGenerateQuery("");
                  }}
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
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider mb-1">
                Or search query (optional)
              </label>
              <input
                value={generateQuery}
                onChange={(e) => {
                  setGenerateQuery(e.target.value);
                  if (e.target.value) setGenerateTopicId("");
                }}
                placeholder="e.g. React state management"
                className="w-full h-10 px-3 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-purple-accent/30 transition-all"
              />
            </div>
          </div>

          {/* Number of questions */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                Number of Questions
              </label>
              <span className="text-sm font-black text-purple-accent">
                {generateNumQuestions}
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="20"
              value={generateNumQuestions}
              onChange={(e) => setGenerateNumQuestions(parseInt(e.target.value))}
              className="w-full h-2 bg-canvas border-2 border-ink rounded-[4px] appearance-none cursor-pointer accent-purple-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-[4px] [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:shadow-hard [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-[4px] [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:shadow-hard [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-ink-muted/40 mt-0.5 px-0.5">
              <span>3</span>
              <span>10</span>
              <span>20</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={generating || (!generateTopicId && !generateQuery.trim())}
            className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-sm shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
          >
            {generating ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
                </span>
                Generating…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Generate Quiz
              </>
            )}
          </button>
        </form>
      )}

      {/* ── Quiz list ── */}
      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center">
          <div className="w-2 h-2 rounded-full bg-purple-accent animate-pulse border border-ink" />
          <span className="text-sm font-mono font-bold text-ink-muted">Loading quizzes…</span>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-[4px] bg-surface border-2 border-ink p-10 shadow-hard text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="#1A1A1A" strokeWidth="1.5" />
              <path d="M7.5 10l1.5 1.5L12.5 8" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-mono font-bold text-ink-muted mb-1">No quizzes yet</p>
          <p className="text-xs font-mono text-ink-muted/60">
            {topics.length === 0
              ? "Create a topic first, then generate a quiz to test your knowledge."
              : "Click &quot;Generate Quiz&quot; above to create your first quiz from your materials."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((quiz, i) => {
            const isDeleting = deletingId === quiz.id;

            return (
              <div
                key={quiz.id}
                className="rounded-[4px] bg-surface border-2 border-ink shadow-hard transition-all duration-150 hover:shadow-hard-hover hover:translate-x-[1px] hover:translate-y-[1px] animate-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Card header */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black tracking-tight text-ink leading-tight truncate">
                        {quiz.title}
                      </h3>
                    </div>
                    {/* Delete */}
                    {isDeleting ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleDelete(quiz.id)}
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
                        onClick={() => setDeletingId(quiz.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-[4px] border border-border-subtle hover:border-red-400 hover:bg-red-50 transition-all shrink-0"
                        title="Delete quiz"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 3h8M4.5 3V1.5h3V3M9.5 3l-.5 7.5H3L2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink bg-gradient-to-r from-blue-start to-blue-end text-[10px] font-mono font-bold text-blue-accent uppercase tracking-wider">
                      {getTopicName(quiz.topic_id)}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] border border-ink text-[10px] font-mono font-bold uppercase tracking-wider ${
                      quiz.mode === "blind_spot"
                        ? "bg-gradient-to-r from-purple-start to-purple-end text-purple-accent"
                        : "bg-gradient-to-r from-green-start to-green-end text-green-accent"
                    }`}>
                      {quiz.mode === "blind_spot" ? "Blind Spot" : "Review"}
                    </span>
                    {quiz.blind_spot_count > 0 && (
                      <span className="text-[10px] font-mono font-bold text-purple-accent">
                        {quiz.blind_spot_count} blind spot{quiz.blind_spot_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card stats */}
                <div className="px-5 pb-2 flex items-center gap-4 text-[11px] font-mono text-ink-muted/60">
                  <span className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1" />
                      <path d="M5 3v2.5L7 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                    {quiz.question_count} question{quiz.question_count !== 1 ? "s" : ""}
                  </span>
                  <span>Generated {formatDate(quiz.generated_at)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleViewHistory(quiz.id, quiz.title); }}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono font-bold text-blue-accent hover:text-ink transition-colors"
                    title="View attempt history"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
                      <path d="M5 3v2.5L7 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                    History
                  </button>
                </div>

                {/* CTA */}
                <div className="px-5 pb-4 pt-2">
                  <button
                    onClick={() => handleStartQuiz(quiz.id)}
                    className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-[4px] border-2 border-ink bg-gradient-to-br from-purple-start to-purple-end text-ink font-bold text-xs shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active transition-all duration-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 1.5v9l7-4.5L3 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    Start Quiz
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
