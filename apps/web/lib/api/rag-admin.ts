import { api } from "./client";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface RAGStatsResponse {
  total_queries: number;
  total_rated: number;
  positive_rate: number;
  negative_rate: number;
  avg_latency_ms: number;
  avg_faithfulness: number | null;
  queries_with_answer: number;
  no_answer_count: number;
  source_breakdown: Record<string, number>;
}

export interface RAGEvaluationResponse {
  id: string;
  query: string;
  answer: string;
  answer_source: string;
  latency_ms: number;
  user_rating: number | null;
  user_feedback: string | null;
  faithfulness_score: number | null;
  created_at: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Admin RAG stats
// ---------------------------------------------------------------------------

/**
 * Get system-wide RAG evaluation statistics.
 * Admin only.
 */
export async function getAdminRagStats(): Promise<RAGStatsResponse> {
  return api.get<RAGStatsResponse>("/api/v1/rag-evaluations/admin/stats", {
    auth: true,
  });
}

// ---------------------------------------------------------------------------
// List admin RAG evaluations
// ---------------------------------------------------------------------------

export interface ListAdminRagEvaluationsParams {
  user_id?: string;
  skip?: number;
  limit?: number;
  min_rating?: number;
}

/**
 * List all users' RAG evaluations, filterable by user_id and min_rating.
 * Admin only.
 */
export async function listAdminRagEvaluations(
  params?: ListAdminRagEvaluationsParams,
): Promise<RAGEvaluationResponse[]> {
  return api.get<RAGEvaluationResponse[]>("/api/v1/rag-evaluations/admin/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}
