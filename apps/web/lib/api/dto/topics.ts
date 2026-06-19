// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface CreateTopicRequest {
  name: string;
  description?: string | null;
}

export interface UpdateTopicRequest {
  name?: string | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface TopicResponse {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}
