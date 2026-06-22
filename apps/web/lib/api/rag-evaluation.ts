import { api } from "./client";
import type {
  RAGEvaluationResponse,
  RateAnswerRequest,
  RAGStatsResponse,
} from "./dto";

// ---------------------------------------------------------------------------
// Get RAG stats
// ---------------------------------------------------------------------------

/**
 * Get RAG quality metrics for the authenticated user.
 */
export async function getRagStats(): Promise<RAGStatsResponse> {
  return api.get<RAGStatsResponse>("/api/v1/rag-evaluations/stats", { auth: true });
}

// ---------------------------------------------------------------------------
// List evaluations
// ---------------------------------------------------------------------------

export interface ListRagEvaluationsParams {
  skip?: number;
  limit?: number;
  min_rating?: number;
}

/**
 * List RAG evaluation history for the authenticated user.
 */
export async function listRagEvaluations(
  params?: ListRagEvaluationsParams
): Promise<RAGEvaluationResponse[]> {
  return api.get<RAGEvaluationResponse[]>("/api/v1/rag-evaluations/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Rate an answer
// ---------------------------------------------------------------------------

/**
 * Rate a past RAG interaction.
 */
export async function rateAnswer(
  evalId: string,
  data: RateAnswerRequest
): Promise<RAGEvaluationResponse> {
  return api.patch<RAGEvaluationResponse>(`/api/v1/rag-evaluations/${evalId}/rate`, {
    auth: true,
    body: data,
  });
}
