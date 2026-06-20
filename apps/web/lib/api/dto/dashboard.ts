// ---------------------------------------------------------------------------
// Audit log entry (used in dashboard recent_activity)
// ---------------------------------------------------------------------------

export interface AuditLogResponse {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  created_at: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export interface DashboardStatsResponse {
  total_topics: number;
  total_journals: number;
  journals_last_7_days: number;
  journals_embedded: number;
  total_sources: number;
  total_chunks: number;
  chunks_embedded: number;
  total_quizzes: number;
  avg_quiz_score: number;
  active_sessions: number;
  total_sessions: number;
  unread_notifications: number;
  total_rag_queries: number;
  rag_positive_rate: number;
  recent_activity: AuditLogResponse[];
  generated_at: string; // ISO datetime
}
