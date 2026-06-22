export interface RAGEvaluationResponse {
  id: string;
  user_id: string;
  query: string;
  answer: string;
  answer_source: string;
  retrieved_chunks: {
    text: string;
    score: number;
    source_type: string;
  }[];
  latency_ms: number;
  user_rating: number | null;
  user_feedback: string | null;
  faithfulness_score: number | null;
  created_at: string; // ISO datetime
}

export interface RateAnswerRequest {
  rating: number; // 1 = up, -1 = down
  feedback?: string;
}

export interface RAGStatsResponse {
  total_rag_queries: number;
  total_rag_rated: number;
  rag_positive_rate: number;
}

