// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface QueryRequest {
  query: string;
  topic_id?: string | null;
  topic_query?: string | null;
  top_k?: number; // default: 7
  synthesize?: boolean; // default: true
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface QueryResultItem {
  source_type: string; // "document_chunk" | "journal_entry"
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface QueryResponse {
  query: string;
  results: QueryResultItem[];
  answer: string | null;
  evaluation_id: string | null;
}
