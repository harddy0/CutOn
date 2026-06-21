// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface CreateSessionRequest {
  topic_id?: string | null;
  title?: string | null;
}

export interface UpdateSessionRequest {
  title?: string | null;
  status?: string | null;
}

export interface ChatRequest {
  message: string;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface StudySessionResponse {
  id: string;
  title: string;
  status: string; // "ACTIVE" | "ARCHIVED"
  topic_id: string | null;
  message_count: number;
  journal_count: number;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface StudyMessageResponse {
  id: string;
  role: string; // "user" | "assistant"
  content: string;
  metadata: Record<string, unknown>;
  created_at: string; // ISO datetime
}

export interface StudySessionDetailResponse extends StudySessionResponse {
  messages: StudyMessageResponse[];
}

export interface ChatResponse {
  reply: string;
  journal_suggestion?: JournalSuggestion | null;
  quiz_suggestion?: QuizSuggestion | null;
}

export interface JournalSuggestion {
  message_id: string;
  content: string;
}

export interface QuizSuggestion {
  topic: string;
  reason: string;
}

export interface ConfirmJournalResponse {
  journal_id: string;
  content: string;
  status: string;
}
