// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface CreateJournalEntryRequest {
  topic_id: string;
  content: string;
}

export interface UpdateJournalEntryRequest {
  content?: string | null;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface JournalEntryResponse {
  id: string;
  user_id: string;
  topic_id: string;
  content: string;
  embedding_status: string; // "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}
