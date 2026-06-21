import { api } from "./client";
import type {
  DashboardStatsResponse,
  DashboardSummaryResponse,
  DashboardLearningResponse,
  DashboardQuizResponse,
  DashboardRagResponse,
  DashboardActivityResponse,
} from "./dto/dashboard";

// ---------------------------------------------------------------------------
// Split endpoints — each category fetches independently with its own cache TTL
// ---------------------------------------------------------------------------

/** Lightweight counts (topics, sources, sessions, notifications). Cached 30s. */
export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  return api.get<DashboardSummaryResponse>("/api/v1/dashboard/summary", {
    auth: true,
  });
}

/** Journal entries, document chunks, embedding progress. Cached 60s. */
export async function getDashboardLearning(): Promise<DashboardLearningResponse> {
  return api.get<DashboardLearningResponse>("/api/v1/dashboard/learning", {
    auth: true,
  });
}

/** Quiz count and average score. Cached 5 min. */
export async function getDashboardQuizzes(): Promise<DashboardQuizResponse> {
  return api.get<DashboardQuizResponse>("/api/v1/dashboard/quizzes", {
    auth: true,
  });
}

/** RAG quality metrics. Cached 5 min. */
export async function getDashboardRag(): Promise<DashboardRagResponse> {
  return api.get<DashboardRagResponse>("/api/v1/dashboard/rag", {
    auth: true,
  });
}

/** Recent activity feed (audit logs). Cached 30s. */
export async function getDashboardActivity(
  limit?: number,
): Promise<DashboardActivityResponse> {
  return api.get<DashboardActivityResponse>("/api/v1/dashboard/activity", {
    auth: true,
    params: { limit },
  });
}

// ---------------------------------------------------------------------------
// Legacy aggregate — single endpoint (deprecated, prefer split functions)
// ---------------------------------------------------------------------------

/** @deprecated Use getDashboardSummary, getDashboardLearning, etc. instead. */
export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return api.get<DashboardStatsResponse>("/api/v1/dashboard/stats", {
    auth: true,
  });
}
